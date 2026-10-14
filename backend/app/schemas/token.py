import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class IssueTokenRequest(BaseModel):
    team_id: uuid.UUID
    role: str = Field(min_length=1, max_length=100)
    permitted_actions: list[str] = Field(min_length=1, max_length=50)
    audience_domains: list[str] | None = None
    ttl_seconds: int | None = Field(default=None, gt=0)


class IssueTokenResponse(BaseModel):
    token: str
    token_type: str = "Bearer"
    jti: uuid.UUID
    issuer: str
    audience: list[str]
    issued_at: datetime
    expires_at: datetime
    header: dict[str, Any]
    claims: dict[str, Any]


class RevokeTokenRequest(BaseModel):
    reason: str | None = Field(default=None, max_length=500)


class RevokeTokenResponse(BaseModel):
    jti: uuid.UUID
    revoked_at: datetime
    already_revoked: bool
    registry_ttl_seconds: int
    reason: str | None = None


class TokenSummary(BaseModel):
    jti: uuid.UUID
    team_id: uuid.UUID
    role: str
    permitted_actions: list[str]
    issued_at: datetime
    expires_at: datetime
    issuer: str
    revoked: bool
    revoked_at: datetime | None = None


class VerifyRequest(BaseModel):
    token: str = Field(min_length=1)
    required_action: str | None = None


class VerificationStep(BaseModel):
    name: str
    passed: bool
    detail: str
    duration_ms: float


class VerificationResult(BaseModel):
    valid: bool
    reason_code: str | None
    verified_by: str
    issuer: str | None
    jti: str | None
    claims: dict[str, Any] | None
    steps: list[VerificationStep]
    duration_ms: float
