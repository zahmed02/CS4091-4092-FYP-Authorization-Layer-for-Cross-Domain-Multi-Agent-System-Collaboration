from typing import Literal

from pydantic import BaseModel, Field


class JoinRequest(BaseModel):
    task_id: str = Field(min_length=1, max_length=100)
    agent_name: str = Field(min_length=1, max_length=100)
    task_role: str = Field(min_length=1, max_length=100)


class ContributionRequest(BaseModel):
    task_id: str = Field(min_length=1, max_length=100)
    agent_name: str = Field(min_length=1, max_length=100)
    kind: Literal["fact", "summary"]
    content: str = Field(min_length=1, max_length=5000)


class CollabAck(BaseModel):
    accepted: bool
    task_id: str
    verified_by: str
    issuer: str | None
    jti: str | None
    verification_ms: float
    contributions: int
