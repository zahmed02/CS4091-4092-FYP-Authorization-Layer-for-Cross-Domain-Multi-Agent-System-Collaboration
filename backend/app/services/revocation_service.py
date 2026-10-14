import uuid
from dataclasses import dataclass
from datetime import datetime, timezone

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


def _key(jti: uuid.UUID | str) -> str:
    return f"{REVOKED_KEY_PREFIX}{jti}"


async def is_revoked(redis: Redis, jti: str) -> bool:
    """Check the revocation registry. Raises RedisError if it is unreachable."""
    return bool(await redis.exists(_key(jti)))


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
    remaining = int((token.expires_at - datetime.now(timezone.utc)).total_seconds())
    ttl = remaining + settings.clock_skew_seconds

    # Redis first, database second: if the database write fails afterwards the
    # token is still blocked (fail closed).
    if ttl > 0:
        try:
            await redis.set(_key(jti), "1", ex=ttl)
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
            "jti": jti,
            "reason": reason,
            "registry_ttl_seconds": max(ttl, 0),
            "token_expires_at": token.expires_at.isoformat(),
        },
    )
    await db.commit()
    await db.refresh(entry)
    return RevocationOutcome(entry, False, max(ttl, 0))
