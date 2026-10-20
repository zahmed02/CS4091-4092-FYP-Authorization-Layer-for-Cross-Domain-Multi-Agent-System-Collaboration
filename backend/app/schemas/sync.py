import uuid

from pydantic import BaseModel, Field


class PeerSyncResult(BaseModel):
    peer: str
    endpoint: str
    status: str  # delivered | rejected | unreachable
    detail: str
    duration_ms: float


class RevocationNoticeIn(BaseModel):
    notice: str = Field(min_length=1)


class RevocationNoticeOut(BaseModel):
    applied: bool
    issuer: str
    revoked_jti: uuid.UUID
    registry_ttl_seconds: int
    detail: str


class ResyncOut(BaseModel):
    revoked_tokens: int
    peers: list[str]
    notices_sent: int
    delivered: int
    failed: int
    failures: list[PeerSyncResult]


class PeerStatus(BaseModel):
    peer: str
    endpoint: str
    key_registered: bool
    reachable: bool
