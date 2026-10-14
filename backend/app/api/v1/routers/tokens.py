import uuid
from dataclasses import asdict

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select

from app.api.deps import DbSession, RedisClient, require_admin
from app.models import RevocationEntry, TokenIssuance
from app.schemas.token import (
    IssueTokenRequest,
    IssueTokenResponse,
    RevokeTokenRequest,
    RevokeTokenResponse,
    TokenSummary,
)
from app.services.issuance_service import issue_token
from app.services.revocation_service import revoke_token

router = APIRouter(
    prefix="/tokens", tags=["tokens"], dependencies=[Depends(require_admin)]
)


@router.post("/issue", response_model=IssueTokenResponse, status_code=201)
async def issue(body: IssueTokenRequest, db: DbSession) -> IssueTokenResponse:
    issued = await issue_token(
        db,
        team_id=body.team_id,
        role=body.role,
        permitted_actions=body.permitted_actions,
        audience_domains=body.audience_domains,
        ttl_seconds=body.ttl_seconds,
    )
    return IssueTokenResponse(**asdict(issued))


@router.post("/{jti}/revoke", response_model=RevokeTokenResponse)
async def revoke(
    jti: uuid.UUID,
    db: DbSession,
    redis: RedisClient,
    body: RevokeTokenRequest | None = None,
) -> RevokeTokenResponse:
    reason = body.reason if body else None
    outcome = await revoke_token(db, redis, jti, reason=reason)
    return RevokeTokenResponse(
        jti=jti,
        revoked_at=outcome.entry.revoked_at,
        already_revoked=outcome.already_revoked,
        registry_ttl_seconds=outcome.registry_ttl_seconds,
        reason=reason,
    )


@router.get("", response_model=list[TokenSummary])
async def list_tokens(
    db: DbSession, limit: int = Query(50, ge=1, le=500)
) -> list[TokenSummary]:
    stmt = (
        select(TokenIssuance, RevocationEntry.revoked_at)
        .outerjoin(
            RevocationEntry,
            RevocationEntry.revocation_reference == TokenIssuance.revocation_reference,
        )
        .order_by(TokenIssuance.issued_at.desc())
        .limit(limit)
    )
    rows = (await db.execute(stmt)).all()
    return [
        TokenSummary(
            jti=t.revocation_reference,
            team_id=t.team_id,
            role=t.role,
            permitted_actions=t.permitted_actions,
            issued_at=t.issued_at,
            expires_at=t.expires_at,
            issuer=t.issuer,
            revoked=revoked_at is not None,
            revoked_at=revoked_at,
        )
        for t, revoked_at in rows
    ]
