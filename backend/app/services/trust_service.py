"""
Trust registry: this domain's own identity plus the public keys of peer
domains it has chosen to trust. A token from another domain is only
verifiable if that domain's public key was registered here first.
"""

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.errors import AppError
from app.core.security import (
    get_public_key,
    key_fingerprint,
    parse_public_key_pem,
    public_key_to_pem,
)
from app.models import AuditEventType, TrustDomain
from app.services.audit_service import record_event

settings = get_settings()

# Parsed peer keys cached in-process; invalidated whenever a peer is (re)registered.
_peer_key_cache: dict[str, Ed25519PublicKey] = {}


async def _find_by_name(db: AsyncSession, name: str) -> TrustDomain | None:
    result = await db.execute(select(TrustDomain).where(TrustDomain.name == name))
    return result.scalar_one_or_none()


async def ensure_self_trust_domain(db: AsyncSession) -> TrustDomain:
    """Make sure this domain has a row describing itself (run at startup)."""
    pem = public_key_to_pem(get_public_key())
    row = await _find_by_name(db, settings.trust_domain_id)
    fingerprint = key_fingerprint(get_public_key())

    if row is None:
        row = TrustDomain(name=settings.trust_domain_id, public_key=pem)
        db.add(row)
        record_event(
            db,
            AuditEventType.TRUST_DOMAIN_CONFIGURED,
            detail={
                "action": "self_registered",
                "domain": settings.trust_domain_id,
                "fingerprint": fingerprint,
            },
        )
    elif row.public_key != pem:
        row.public_key = pem
        record_event(
            db,
            AuditEventType.TRUST_DOMAIN_CONFIGURED,
            detail={
                "action": "self_key_updated",
                "domain": settings.trust_domain_id,
                "fingerprint": fingerprint,
            },
        )

    await db.commit()
    await db.refresh(row)
    return row


async def get_self_domain(db: AsyncSession) -> TrustDomain:
    row = await _find_by_name(db, settings.trust_domain_id)
    if row is None:
        raise AppError("SELF_DOMAIN_MISSING", "This domain has no registry row.", 500)
    return row


async def list_domains(db: AsyncSession) -> list[TrustDomain]:
    result = await db.execute(select(TrustDomain).order_by(TrustDomain.created_at))
    return list(result.scalars().all())


async def register_peer_domain(
    db: AsyncSession, name: str, public_key_pem: str
) -> TrustDomain:
    """Trust a peer domain by recording its public key. Raises ValueError if invalid."""
    if name == settings.trust_domain_id:
        raise ValueError("A domain cannot be registered as its own peer.")

    parsed = parse_public_key_pem(public_key_pem)  # validates
    canonical_pem = public_key_to_pem(parsed)

    row = await _find_by_name(db, name)
    action = "peer_registered"
    if row is None:
        row = TrustDomain(name=name, public_key=canonical_pem)
        db.add(row)
    else:
        action = "peer_key_updated"
        row.public_key = canonical_pem

    record_event(
        db,
        AuditEventType.TRUST_DOMAIN_CONFIGURED,
        detail={
            "action": action,
            "domain": name,
            "fingerprint": key_fingerprint(parsed),
        },
    )
    await db.commit()
    await db.refresh(row)
    _peer_key_cache.pop(name, None)
    return row


async def resolve_issuer_public_key(
    db: AsyncSession, issuer: str
) -> Ed25519PublicKey | None:
    """Return the public key to verify a token from `issuer`, or None if untrusted."""
    if issuer == settings.trust_domain_id:
        return get_public_key()

    cached = _peer_key_cache.get(issuer)
    if cached is not None:
        return cached

    row = await _find_by_name(db, issuer)
    if row is None:
        return None
    key = parse_public_key_pem(row.public_key)
    _peer_key_cache[issuer] = key
    return key
