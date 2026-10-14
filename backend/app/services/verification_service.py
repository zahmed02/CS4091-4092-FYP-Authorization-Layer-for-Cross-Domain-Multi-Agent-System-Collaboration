"""
Capability-token verification pipeline.

Seven ordered checks, each reported with its own pass/fail and timing so the
whole decision is inspectable (and can be animated on the dashboard):

  1. format        well-formed JWT, EdDSA only, key id present
  2. issuer_key    issuer is this domain or a registered trusted peer
  3. signature     Ed25519 signature verifies, required claims present
  4. expiry        token has not expired (small clock-skew allowance)
  5. audience      this domain is in the token's audience
  6. scope         requested action is among the permitted actions
  7. revocation    token id is not in the revocation registry (fails closed)
"""

import logging
import time
import uuid
from typing import Any

import jwt
from redis.asyncio import Redis
from redis.exceptions import RedisError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.security import ALGORITHM
from app.models import AuditEventType, TokenIssuance
from app.schemas.token import VerificationResult, VerificationStep
from app.services.audit_service import record_event
from app.services.revocation_service import is_revoked
from app.services.trust_service import resolve_issuer_public_key

logger = logging.getLogger(__name__)
settings = get_settings()

REQUIRED_CLAIMS = ["iss", "sub", "aud", "jti", "iat", "exp"]


def _step(
    steps: list[VerificationStep], name: str, passed: bool, detail: str, started: float
) -> None:
    steps.append(
        VerificationStep(
            name=name,
            passed=passed,
            detail=detail,
            duration_ms=round((time.perf_counter() - started) * 1000, 3),
        )
    )


async def _run_pipeline(
    db: AsyncSession,
    redis: Redis,
    token: str,
    required_action: str | None,
    steps: list[VerificationStep],
    ctx: dict[str, Any],
) -> str | None:
    """Run the checks in order. Returns a reason code on failure, None on success."""
    own = settings.trust_domain_id

    # 1. format
    t0 = time.perf_counter()
    try:
        header = jwt.get_unverified_header(token)
    except jwt.PyJWTError:
        _step(steps, "format", False, "Not a well-formed JWT.", t0)
        return "MALFORMED_TOKEN"
    if header.get("alg") != ALGORITHM:
        _step(
            steps,
            "format",
            False,
            f"Algorithm '{header.get('alg')}' rejected; only {ALGORITHM} is accepted.",
            t0,
        )
        return "ALGORITHM_NOT_ALLOWED"
    kid = header.get("kid")
    if not isinstance(kid, str) or not kid:
        _step(steps, "format", False, "Header has no key id (kid).", t0)
        return "MISSING_KEY_ID"
    ctx["issuer"] = kid
    _step(steps, "format", True, f"Well-formed JWT, alg={ALGORITHM}, kid={kid}.", t0)

    # 2. issuer key
    t0 = time.perf_counter()
    key = await resolve_issuer_public_key(db, kid)
    if key is None:
        _step(
            steps,
            "issuer_key",
            False,
            f"No trusted public key registered for issuer '{kid}'.",
            t0,
        )
        return "UNKNOWN_ISSUER"
    origin = "this domain's own key" if kid == own else "registered trusted peer key"
    _step(steps, "issuer_key", True, f"Resolved {origin} for '{kid}'.", t0)

    # 3. signature
    t0 = time.perf_counter()
    try:
        claims = jwt.decode(
            token,
            key,
            algorithms=[ALGORITHM],
            options={
                "require": REQUIRED_CLAIMS,
                # Time and audience are checked explicitly below so each gets
                # its own step and reason code.
                "verify_exp": False,
                "verify_aud": False,
                "verify_iat": False,
                "verify_nbf": False,
            },
        )
    except jwt.InvalidSignatureError:
        _step(
            steps,
            "signature",
            False,
            f"Signature does not match {kid}'s public key.",
            t0,
        )
        return "INVALID_SIGNATURE"
    except jwt.MissingRequiredClaimError as exc:
        _step(steps, "signature", False, f"Missing required claim '{exc.claim}'.", t0)
        return "MISSING_CLAIM"
    except jwt.PyJWTError as exc:
        _step(steps, "signature", False, f"Token could not be decoded: {exc}", t0)
        return "MALFORMED_TOKEN"
    if claims.get("iss") != kid:
        _step(steps, "signature", False, "Claim 'iss' does not match header 'kid'.", t0)
        return "ISSUER_MISMATCH"
    ctx["claims"] = claims
    _step(
        steps, "signature", True, f"Ed25519 signature verified for issuer '{kid}'.", t0
    )

    # 4. expiry
    t0 = time.perf_counter()
    now = time.time()
    skew = settings.clock_skew_seconds
    exp = claims["exp"]
    if not isinstance(exp, (int, float)):
        _step(steps, "expiry", False, "Claim 'exp' is not a number.", t0)
        return "MALFORMED_TOKEN"
    if now > exp + skew:
        _step(steps, "expiry", False, f"Token expired {int(now - exp)}s ago.", t0)
        return "TOKEN_EXPIRED"
    nbf = claims.get("nbf")
    if isinstance(nbf, (int, float)) and now + skew < nbf:
        _step(steps, "expiry", False, "Token is not valid yet (nbf).", t0)
        return "TOKEN_NOT_YET_VALID"
    _step(steps, "expiry", True, f"Valid for another {max(int(exp - now), 0)}s.", t0)

    # 5. audience
    t0 = time.perf_counter()
    aud = claims["aud"]
    audiences = (
        [aud] if isinstance(aud, str) else list(aud) if isinstance(aud, list) else []
    )
    if own not in audiences:
        _step(
            steps,
            "audience",
            False,
            f"Domain '{own}' is not in the token audience {audiences}.",
            t0,
        )
        return "AUDIENCE_MISMATCH"
    _step(
        steps, "audience", True, f"Domain '{own}' is in the audience {audiences}.", t0
    )

    # 6. scope
    t0 = time.perf_counter()
    if required_action is None:
        _step(
            steps,
            "scope",
            True,
            "No specific action requested; scope not enforced.",
            t0,
        )
    else:
        permitted = claims.get("permitted_actions")
        if not isinstance(permitted, list) or required_action not in permitted:
            _step(
                steps,
                "scope",
                False,
                f"Action '{required_action}' is not in permitted actions {permitted}.",
                t0,
            )
            return "INSUFFICIENT_SCOPE"
        _step(steps, "scope", True, f"Action '{required_action}' is permitted.", t0)

    # 7. revocation (fails closed)
    t0 = time.perf_counter()
    try:
        revoked = await is_revoked(redis, str(claims["jti"]))
    except RedisError:
        _step(
            steps,
            "revocation",
            False,
            "Revocation registry unreachable; rejecting (fail closed).",
            t0,
        )
        return "REVOCATION_CHECK_UNAVAILABLE"
    if revoked:
        _step(steps, "revocation", False, "Token id is in the revocation registry.", t0)
        return "TOKEN_REVOKED"
    note = "Not in this domain's revocation registry."
    if kid != own:
        note += " (Local registry only: cross-domain revocation sync is not built yet.)"
    _step(steps, "revocation", True, note, t0)

    return None


async def _record_audit(
    db: AsyncSession, result: VerificationResult, required_action: str | None
) -> None:
    """Persist one audit row. Never lets an audit failure change the verdict."""
    try:
        own = settings.trust_domain_id
        team_id: uuid.UUID | None = None
        token_id: uuid.UUID | None = None

        # Foreign tokens are not in our tables, so foreign keys stay empty and the
        # identifiers go into the JSON detail instead.
        if result.issuer == own and result.jti:
            try:
                row = await db.get(TokenIssuance, uuid.UUID(result.jti))
            except ValueError:
                row = None
            if row is not None:
                token_id = row.revocation_reference
                team_id = row.team_id

        failed = next((s.name for s in result.steps if not s.passed), None)
        claims = result.claims or {}
        record_event(
            db,
            AuditEventType.TOKEN_VERIFIED
            if result.valid
            else AuditEventType.TOKEN_REJECTED,
            team_id=team_id,
            token_id=token_id,
            detail={
                "reason_code": result.reason_code,
                "failed_step": failed,
                "issuer": result.issuer,
                "jti": result.jti,
                "subject_team": claims.get("sub"),
                "required_action": required_action,
                "verification_ms": result.duration_ms,
            },
        )
        await db.commit()
    except Exception:
        await db.rollback()
        logger.exception("Failed to write verification audit event")


async def verify_token(
    db: AsyncSession,
    redis: Redis,
    token: str,
    required_action: str | None = None,
    *,
    record_audit: bool | None = None,
) -> VerificationResult:
    started = time.perf_counter()
    steps: list[VerificationStep] = []
    ctx: dict[str, Any] = {"claims": None, "issuer": None}

    reason = await _run_pipeline(db, redis, token, required_action, steps, ctx)

    claims = ctx["claims"]
    result = VerificationResult(
        valid=reason is None,
        reason_code=reason,
        verified_by=settings.trust_domain_id,
        issuer=ctx["issuer"],
        jti=str(claims["jti"]) if claims else None,
        claims=claims,
        steps=steps,
        duration_ms=round((time.perf_counter() - started) * 1000, 3),
    )

    should_audit = (
        settings.audit_verifications if record_audit is None else record_audit
    )
    if should_audit:
        await _record_audit(db, result, required_action)
    return result
