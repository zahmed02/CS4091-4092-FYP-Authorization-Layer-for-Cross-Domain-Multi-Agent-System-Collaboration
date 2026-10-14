import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict

from app.models.enums import AuditEventType


class AuditEventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    event_id: uuid.UUID
    event_type: AuditEventType
    team_id: uuid.UUID | None
    token_id: uuid.UUID | None
    timestamp: datetime
    detail: dict[str, Any] | None
