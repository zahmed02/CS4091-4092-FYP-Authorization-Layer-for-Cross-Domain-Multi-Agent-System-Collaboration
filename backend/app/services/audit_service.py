import json
import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AuditEventType, AuditLogEvent


def _jsonable(detail: dict[str, Any] | None) -> dict[str, Any] | None:
    if detail is None:
        return None
    return json.loads(json.dumps(detail, default=str))


def record_event(
    db: AsyncSession,
    event_type: AuditEventType,
    *,
    team_id: uuid.UUID | None = None,
    token_id: uuid.UUID | None = None,
    detail: dict[str, Any] | None = None,
) -> AuditLogEvent:
    """Stage an audit row on the session. The caller commits."""
    event = AuditLogEvent(
        event_type=event_type,
        team_id=team_id,
        token_id=token_id,
        detail=_jsonable(detail),
    )
    db.add(event)
    return event


async def list_events(
    db: AsyncSession, limit: int = 50, event_type: AuditEventType | None = None
) -> list[AuditLogEvent]:
    stmt = select(AuditLogEvent).order_by(AuditLogEvent.timestamp.desc()).limit(limit)
    if event_type is not None:
        stmt = stmt.where(AuditLogEvent.event_type == event_type)
    return list((await db.execute(stmt)).scalars().all())
