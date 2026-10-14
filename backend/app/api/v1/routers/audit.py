from fastapi import APIRouter, Depends, Query

from app.api.deps import DbSession, require_admin
from app.models import AuditEventType
from app.schemas.audit import AuditEventOut
from app.services.audit_service import list_events

router = APIRouter(
    prefix="/audit-events", tags=["audit"], dependencies=[Depends(require_admin)]
)


@router.get("", response_model=list[AuditEventOut])
async def get_events(
    db: DbSession,
    limit: int = Query(50, ge=1, le=500),
    event_type: AuditEventType | None = None,
):
    return await list_events(db, limit=limit, event_type=event_type)
