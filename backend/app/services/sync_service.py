"""
Cross-domain revocation sync.

Sender side (the domain that issued the token):
  build_notice / propagate_revocation push a signed revocation notice to every
  configured peer right after a local revoke. resync_active_revocations
  re-sends all still-active revoked tokens (recovery after a peer was down).

Receiver side (the peer domain):
  apply_revocation_notice verifies the notice with the sender's registered
  public key and writes a registry entry in this domain's own Redis.

A notice is a JWT signed with the sender's Ed25519 key. It has header
typ=revocation+jwt and claim type=revocation_notice, so it can never be
mistaken for a capability token (and vice versa). The registry key is
namespaced by issuer, so a peer can only revoke tokens it issued itself.
"""

import asyncio
import logging
import time
import uuid
from datetime import UTC, datetime

import httpx
import jwt
from redis.asyncio import Redis
from redis.exceptions import RedisError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.errors import AppError
from app.core.security import ALGORITHM, sign_token
from app.models import AuditEventType, RevocationEntry, TokenIssuance
from app.schemas.sync import (
    PeerStatus,
    PeerSyncResult,
    ResyncOut,
    RevocationNoticeOut,
)
from app.services.audit_service import record_event
from app.services.revocation_service import register_revocation
from app.services.trust_service import resolve_issuer_public_key

logger = logging.getLogger(__name__)
settings = get_settings()

NOTICE_TYP = "revocation+jwt"
NOTICE_TYPE_CLAIM = "revocation_notice"
SYNC_PATH = "/api/v1/revocations/sync"

REQUIRED_NOTICE_CLAIMS = [
    "type",
    "iss",
    "aud",
    "jti",
    "iat",
    "exp",
    "revoked_jti",
    "token_exp",
]


def _ms(started: float) -> float:
    return round((time.perf_counter() - started) * 1000, 3)


# --------------------------------------------------------------------------
# Sender side
# --------------------------------------------------------------------------


def build_notice(
    *,
    peer: str,
    revoked_jti: uuid.UUID,
    token_expires_at: datetime,
    revoked_at: datetime,
    reason: str | None,
) -> str:
    """Create and sign a revocation notice addressed to one peer domain."""
    now = int(time.time())
    claims = {
        "type": NOTICE_TYPE_CLAIM,
        "iss": settings.trust_domain_id,
        "aud": [peer],
        "jti": str(uuid.uuid4()),
        "iat": now,
        "exp": now + settings.revocation_notice_ttl_seconds,
        "revoked_jti": str(revoked_jti),
        "token_exp": int(token_expires_at.timestamp()),
        "revoked_at": int(revoked_at.timestamp()),
        "reason": reason,
    }
    notice, _ = sign_token(claims, typ=NOTICE_TYP)
    return notice


async def _push(
    client: httpx.AsyncClient, peer: str, base_url: str, notice: str
) -> PeerSyncResult:
    started = time.perf_counter()
    try:
        response = await client.post(f"{base_url}{SYNC_PATH}", json={"notice": notice})
    except httpx.HTTPError as exc:
        return PeerSyncResult(
            peer=peer,
            endpoint=base_url,
            status="unreachable",
            detail=f"{type(exc).__name__}: {exc}"[:200],
            duration_ms=_ms(started),
        )

    if response.status_code == 200:
        try:
            detail = str(response.json().get("detail", "accepted"))
        except ValueError:
            detail = "accepted"
        return PeerSyncResult(
            peer=peer,
            endpoint=base_url,
            status="delivered",
            detail=detail,
            duration_ms=_ms(started),
        )

    try:
        code = response.json()["error"]["code"]
    except (ValueError, KeyError, TypeError):
        code = "no error code"
    return PeerSyncResult(
        peer=peer,
        endpoint=base_url,
        status="rejected",
        detail=f"Peer answered {response.status_code}: {code}",
        duration_ms=_ms(started),
    )


async def propagate_revocation(
    *,
    revoked_jti: uuid.UUID,
    token_expires_at: datetime,
    revoked_at: datetime,
    reason: str | None,
) -> list[PeerSyncResult]:
    """Push a signed notice to every configured peer, concurrently."""
    peers = settings.peer_endpoint_map
    if not peers:
        return []

    async with httpx.AsyncClient(timeout=settings.peer_sync_timeout_seconds) as client:
        results = await asyncio.gather(
            *[
                _push(
                    client,
                    peer,
                    url,
                    build_notice(
                        peer=peer,
                        revoked_jti=revoked_jti,
                        token_expires_at=token_expires_at,
                        revoked_at=revoked_at,
                        reason=reason,
                    ),
                )
                for peer, url in peers.items()
            ]
        )

    for result in results:
        if result.status != "delivered":
            logger.warning(
                "Revocation of %s not delivered to %s: %s (%s)",
                revoked_jti,
                result.peer,
                result.status,
                result.detail,
            )
    return list(results)


async def resync_active_revocations(db: AsyncSession) -> ResyncOut:
    """Re-send every revoked token that has not expired yet to all peers."""
    peers = settings.peer_endpoint_map
    now = datetime.now(UTC)
    stmt = (
        select(
            TokenIssuance.revocation_reference,
            TokenIssuance.expires_at,
            RevocationEntry.revoked_at,
        )
        .join(
            RevocationEntry,
            RevocationEntry.revocation_reference == TokenIssuance.revocation_reference,
        )
        .where(TokenIssuance.expires_at > now)
    )
    rows = (await db.execute(stmt)).all()

    results: list[PeerSyncResult] = []
    if peers and rows:
        gate = asyncio.Semaphore(10)

        async with httpx.AsyncClient(
            timeout=settings.peer_sync_timeout_seconds
        ) as client:

            async def send(peer, url, jti, expires_at, revoked_at) -> PeerSyncResult:
                async with gate:
                    notice = build_notice(
                        peer=peer,
                        revoked_jti=jti,
                        token_expires_at=expires_at,
                        revoked_at=revoked_at,
                        reason="resync",
                    )
                    return await _push(client, peer, url, notice)

            results = list(
                await asyncio.gather(
                    *[
                        send(peer, url, jti, expires_at, revoked_at)
                        for jti, expires_at, revoked_at in rows
                        for peer, url in peers.items()
                    ]
                )
            )

    delivered = sum(1 for r in results if r.status == "delivered")
    return ResyncOut(
        revoked_tokens=len(rows),
        peers=list(peers),
        notices_sent=len(results),
        delivered=delivered,
        failed=len(results) - delivered,
        failures=[r for r in results if r.status != "delivered"][:20],
    )


async def _ping(client: httpx.AsyncClient, peer: str, base_url: str) -> bool:
    try:
        response = await client.get(f"{base_url}/health")
        return (
            response.status_code == 200
            and response.json().get("trust_domain_id") == peer
        )
    except (httpx.HTTPError, ValueError):
        return False


async def peer_status(db: AsyncSession) -> list[PeerStatus]:
    """For each configured peer: is its key registered, and is it reachable?"""
    peers = settings.peer_endpoint_map
    registered = {
        peer: (await resolve_issuer_public_key(db, peer)) is not None for peer in peers
    }
    async with httpx.AsyncClient(timeout=settings.peer_sync_timeout_seconds) as client:
        reachable = await asyncio.gather(
            *[_ping(client, peer, url) for peer, url in peers.items()]
        )
    return [
        PeerStatus(
            peer=peer,
            endpoint=url,
            key_registered=registered[peer],
            reachable=ok,
        )
        for (peer, url), ok in zip(peers.items(), reachable, strict=True)
    ]


# --------------------------------------------------------------------------
# Receiver side
# --------------------------------------------------------------------------


async def apply_revocation_notice(
    db: AsyncSession, redis: Redis, notice: str
) -> RevocationNoticeOut:
    """Verify a signed notice from a trusted peer and register the revocation."""
    own = settings.trust_domain_id

    try:
        header = jwt.get_unverified_header(notice)
    except jwt.PyJWTError as exc:
        raise AppError("MALFORMED_NOTICE", "Not a well-formed JWT.", 400) from exc
    if header.get("alg") != ALGORITHM:
        raise AppError(
            "ALGORITHM_NOT_ALLOWED",
            f"Only {ALGORITHM} is accepted.",
            401,
        )
    if header.get("typ") != NOTICE_TYP:
        raise AppError("WRONG_TOKEN_TYPE", "This is not a revocation notice.", 400)
    kid = header.get("kid")
    if not isinstance(kid, str) or not kid:
        raise AppError("MISSING_KEY_ID", "Header has no key id (kid).", 400)
    if kid == own:
        raise AppError(
            "SELF_NOTICE", "A domain does not accept notices from itself.", 400
        )

    key = await resolve_issuer_public_key(db, kid)
    if key is None:
        raise AppError(
            "UNKNOWN_ISSUER",
            f"No trusted public key registered for '{kid}'.",
            403,
        )

    try:
        claims = jwt.decode(
            notice,
            key,
            algorithms=[ALGORITHM],
            options={
                "require": REQUIRED_NOTICE_CLAIMS,
                "verify_exp": False,
                "verify_aud": False,
                "verify_iat": False,
                "verify_nbf": False,
            },
        )
    except jwt.InvalidSignatureError as exc:
        raise AppError(
            "INVALID_SIGNATURE",
            f"Signature does not match {kid}'s public key.",
            401,
        ) from exc
    except jwt.MissingRequiredClaimError as exc:
        raise AppError(
            "MISSING_CLAIM", f"Missing required claim '{exc.claim}'.", 400
        ) from exc
    except jwt.PyJWTError as exc:
        raise AppError("MALFORMED_NOTICE", f"Could not decode: {exc}", 400) from exc

    if claims["iss"] != kid:
        raise AppError("ISSUER_MISMATCH", "Claim 'iss' does not match 'kid'.", 401)
    if claims["type"] != NOTICE_TYPE_CLAIM:
        raise AppError("WRONG_TOKEN_TYPE", "This is not a revocation notice.", 400)

    aud = claims["aud"]
    audiences = (
        [aud] if isinstance(aud, str) else list(aud) if isinstance(aud, list) else []
    )
    if own not in audiences:
        raise AppError(
            "AUDIENCE_MISMATCH",
            f"Notice is not addressed to '{own}'.",
            403,
        )

    now = time.time()
    exp = claims["exp"]
    token_exp = claims["token_exp"]
    if not isinstance(exp, (int, float)) or not isinstance(token_exp, (int, float)):
        raise AppError("INVALID_NOTICE", "Time claims must be numbers.", 422)
    if now > exp + settings.clock_skew_seconds:
        raise AppError("NOTICE_EXPIRED", "Revocation notice has expired.", 401)
    try:
        revoked_jti = uuid.UUID(str(claims["revoked_jti"]))
    except ValueError as exc:
        raise AppError("INVALID_NOTICE", "revoked_jti is not a valid id.", 422) from exc

    # Keep the entry only as long as the token could still be accepted.
    ttl = int(token_exp - now) + settings.clock_skew_seconds
    try:
        applied = await register_revocation(redis, kid, revoked_jti, ttl)
    except RedisError as exc:
        raise AppError(
            "REVOCATION_REGISTRY_UNAVAILABLE",
            "Could not write to the revocation registry.",
            503,
        ) from exc

    record_event(
        db,
        AuditEventType.TOKEN_REVOKED,
        detail={
            "source": "peer_sync",
            "origin_domain": kid,
            "revoked_jti": revoked_jti,
            "notice_jti": claims["jti"],
            "reason": claims.get("reason"),
            "registry_ttl_seconds": max(ttl, 0),
            "applied": applied,
        },
    )
    await db.commit()

    return RevocationNoticeOut(
        applied=applied,
        issuer=kid,
        revoked_jti=revoked_jti,
        registry_ttl_seconds=max(ttl, 0),
        detail=(
            f"Revocation from '{kid}' registered locally."
            if applied
            else "Token already expired; nothing to register."
        ),
    )
