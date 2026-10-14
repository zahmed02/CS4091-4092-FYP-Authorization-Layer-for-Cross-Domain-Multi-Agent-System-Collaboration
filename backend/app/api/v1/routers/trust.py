from fastapi import APIRouter, Depends

from app.api.deps import DbSession, require_admin
from app.core.config import get_settings
from app.core.errors import AppError
from app.core.security import key_fingerprint, parse_public_key_pem
from app.models import TrustDomain
from app.schemas.trust import TrustDomainOut, TrustDomainRegister
from app.services.trust_service import (
    get_self_domain,
    list_domains,
    register_peer_domain,
)

settings = get_settings()
router = APIRouter(prefix="/trust-domains", tags=["trust domains"])


def _to_out(row: TrustDomain) -> TrustDomainOut:
    return TrustDomainOut(
        trust_domain_id=row.trust_domain_id,
        name=row.name,
        public_key=row.public_key,
        fingerprint=key_fingerprint(parse_public_key_pem(row.public_key)),
        is_self=row.name == settings.trust_domain_id,
        created_at=row.created_at,
    )


@router.get("/self", response_model=TrustDomainOut)
async def get_self(db: DbSession) -> TrustDomainOut:
    """Public: this domain's identity and public key, for peers to register."""
    return _to_out(await get_self_domain(db))


@router.get(
    "", response_model=list[TrustDomainOut], dependencies=[Depends(require_admin)]
)
async def list_all(db: DbSession) -> list[TrustDomainOut]:
    return [_to_out(r) for r in await list_domains(db)]


@router.post(
    "",
    response_model=TrustDomainOut,
    status_code=201,
    dependencies=[Depends(require_admin)],
)
async def register_peer(body: TrustDomainRegister, db: DbSession) -> TrustDomainOut:
    try:
        row = await register_peer_domain(db, body.name, body.public_key)
    except ValueError as exc:
        raise AppError("INVALID_TRUST_DOMAIN", str(exc), 422) from exc
    return _to_out(row)
