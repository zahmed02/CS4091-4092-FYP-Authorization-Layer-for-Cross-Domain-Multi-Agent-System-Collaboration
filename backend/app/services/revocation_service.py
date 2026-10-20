import uuid
from dataclasses import dataclass
from datetime import UTC, datetime

from redis.asyncio import Redis
from redis.exceptions import RedisError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.errors import AppError
from app.models import AuditEventType, RevocationEntry, TokenIssuance
from app.services.audit_service import record_event

settings = get_settings()

REVOKED_KEY_PREFIX = "revoked:"


@dataclass
class RevocationOutcome:
    entry: RevocationEntry
    already_revoked: bool
    registry_ttl_seconds: int


def revocation_key(issuer: str, jti: uuid.UUID | str) -> str:
    """
    Registry key, namespaced by issuer: revoked:<issuer>:<jti>.

    The namespace means a trusted peer can only ever revoke tokens that it
    issued itself, never tokens issued by another domain.
    """
    return f"{REVOKED_KEY_PREFIX}{issuer}:{jti}"


def registry_ttl_for(expires_at: datetime) -> int:
    """Seconds the registry entry must live: token remaining life plus skew."""
    remaining = int((expires_at - datetime.now(UTC)).total_seconds())
    return remaining + settings.clock_skew_seconds


async def register_revocation(
    redis: Redis, issuer: str, jti: uuid.UUID | str, ttl_seconds: int
) -> bool:
    """
    Write a registry entry that expires on its own. Returns False when the
    token has already expired (nothing to register). Raises RedisError if the
    registry is unreachable.
    """
    if ttl_seconds <= 0:
        return False
    await redis.set(revocation_key(issuer, jti), "1", ex=ttl_seconds)
    return True


async def is_revoked(redis: Redis, issuer: str, jti: str) -> bool:
    """Check the revocation registry. Raises RedisError if it is unreachable."""
    return bool(await redis.exists(revocation_key(issuer, jti)))


async def revoke_token(
    db: AsyncSession, redis: Redis, jti: uuid.UUID, reason: str | None = None
) -> RevocationOutcome:
    token = await db.get(TokenIssuance, jti)
    if token is None:
        raise AppError(
            "TOKEN_NOT_FOUND", f"No token with id {jti} was issued by this domain.", 404
        )

    # The registry entry only needs to live as long as the token could still be
    # accepted (expiry plus clock skew). After that it expires by itself, which
    # keeps registry memory proportional to live revoked tokens only.
    ttl = registry_ttl_for(token.expires_at)

    # Redis first, database second: if the database write fails afterwards the
    # token is still blocked (fail closed).
    try:
        await register_revocation(redis, token.issuer, jti, ttl)
    except RedisError as exc:
        raise AppError(
            "REVOCATION_REGISTRY_UNAVAILABLE",
            "Could not write to the revocation registry.",
            503,
        ) from exc

    existing = await db.get(RevocationEntry, jti)
    if existing is not None:
        return RevocationOutcome(existing, True, max(ttl, 0))

    entry = RevocationEntry(revocation_reference=jti, ttl_expires_at=token.expires_at)
    db.add(entry)
    record_event(
        db,
        AuditEventType.TOKEN_REVOKED,
        team_id=token.team_id,
        token_id=jti,
        detail={
            "source": "local",
            "jti": jti,
            "reason": reason,
            "registry_ttl_seconds": max(ttl, 0),
            "token_expires_at": token.expires_at.isoformat(),
        },
    )
    await db.commit()
    await db.refresh(entry)
    return RevocationOutcome(entry, False, max(ttl, 0))
