import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class TeamCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)


class TeamOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    team_id: uuid.UUID
    trust_domain_id: uuid.UUID
    name: str
    created_at: datetime
