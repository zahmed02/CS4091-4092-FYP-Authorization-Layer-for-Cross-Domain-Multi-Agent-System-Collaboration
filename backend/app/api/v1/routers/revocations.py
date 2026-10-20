from fastapi import APIRouter, Depends

from app.api.deps import DbSession, RedisClient, require_admin
from app.schemas.sync import (
    PeerStatus,
    ResyncOut,
    RevocationNoticeIn,
    RevocationNoticeOut,
)
from app.services.sync_service import (
    apply_revocation_notice,
    peer_status,
    resync_active_revocations,
)

router = APIRouter(prefix="/revocations", tags=["revocation sync"])


@router.post("/sync", response_model=RevocationNoticeOut)
async def receive_notice(
    body: RevocationNoticeIn, db: DbSession, redis: RedisClient
) -> RevocationNoticeOut:
    """
    Receive a signed revocation notice from a trusted peer domain. There is no
    admin key here: the notice authenticates itself with the sender's Ed25519
    signature, checked against the public key registered for that peer.
    """
    return await apply_revocation_notice(db, redis, body.notice)


@router.post("/resync", response_model=ResyncOut, dependencies=[Depends(require_admin)])
async def resync(db: DbSession) -> ResyncOut:
    """Re-send all still-active revoked tokens to every peer (recovery)."""
    return await resync_active_revocations(db)


@router.get(
    "/peers", response_model=list[PeerStatus], dependencies=[Depends(require_admin)]
)
async def peers(db: DbSession) -> list[PeerStatus]:
    """Configured peers: is the key registered and is the peer reachable?"""
    return await peer_status(db)
