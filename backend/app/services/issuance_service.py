import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.errors import AppError
from app.core.security import sign_token
from app.models import AuditEventType, Team, TokenIssuance
from app.services.audit_service import record_event

settings = get_settings()


@dataclass
class IssuedToken:
    token: str
    jti: uuid.UUID
    issuer: str
    audience: list[str]
    issued_at: datetime
    expires_at: datetime
    header: dict[str, Any]
    claims: dict[str, Any]


async def issue_token(
    db: AsyncSession,
    *,
    team_id: uuid.UUID,
    role: str,
    permitted_actions: list[str],
    audience_domains: list[str] | None,
    ttl_seconds: int | None,
) -> IssuedToken:
    team = await db.get(Team, team_id)
    if team is None:
        raise AppError(
            "TEAM_NOT_FOUND", f"No team with id {team_id} in this domain.", 404
        )

    ttl = ttl_seconds if ttl_seconds is not None else settings.token_default_ttl_seconds
    if ttl <= 0 or ttl > settings.token_max_ttl_seconds:
        raise AppError(
            "INVALID_TTL",
            f"ttl_seconds must be between 1 and {settings.token_max_ttl_seconds}.",
            422,
        )

    actions = sorted({a.strip() for a in permitted_actions if a.strip()})
    if not actions:
        raise AppError(
            "NO_ACTIONS", "At least one non-empty permitted action is required.", 422
        )

    own = settings.trust_domain_id
    audience = sorted({d.strip() for d in (audience_domains or []) if d.strip()}) or [
        own
    ]

    issued_at = datetime.now(timezone.utc).replace(microsecond=0)
    expires_at = issued_at + timedelta(seconds=ttl)
    jti = uuid.uuid4()

    claims: dict[str, Any] = {
        "iss": own,
        "sub": str(team.team_id),
        "aud": audience,
        "jti": str(jti),
        "iat": int(issued_at.timestamp()),
        "exp": int(expires_at.timestamp()),
        "role": role,
        "permitted_actions": actions,
    }

    # Sign first: if signing fails, nothing is persisted.
    token, header = sign_token(claims)

    db.add(
        TokenIssuance(
            revocation_reference=jti,
            team_id=team.team_id,
            role=role,
            permitted_actions=actions,
            issued_at=issued_at,
            expires_at=expires_at,
            issuer=own,
        )
    )
    await db.flush()  # token row must exist before the audit row references it
    record_event(
        db,
        AuditEventType.TOKEN_ISSUED,
        team_id=team.team_id,
        token_id=jti,
        detail={
            "jti": jti,
            "role": role,
            "permitted_actions": actions,
            "audience": audience,
            "ttl_seconds": ttl,
            "alg": header.get("alg"),
            "kid": header.get("kid"),
        },
    )
    await db.commit()

    return IssuedToken(
        token=token,
        jti=jti,
        issuer=own,
        audience=audience,
        issued_at=issued_at,
        expires_at=expires_at,
        header=header,
        claims=claims,
    )
