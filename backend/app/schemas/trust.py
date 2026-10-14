import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class TrustDomainRegister(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    public_key: str = Field(min_length=1)


class TrustDomainOut(BaseModel):
    trust_domain_id: uuid.UUID
    name: str
    public_key: str
    fingerprint: str
    is_self: bool
    created_at: datetime
