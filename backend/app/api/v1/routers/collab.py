import json
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends

from app.api.deps import DbSession, RedisClient, require_admin, require_capability
from app.models.enums import AuditEventType
from app.schemas.collab import CollabAck, ContributionRequest, JoinRequest
from app.schemas.token import VerificationResult
from app.services.audit_service import record_event

router = APIRouter(prefix="/collab", tags=["collab"])

ACTION = "task:contribute"
TASK_TTL_SECONDS = 3600

# Every call below re-verifies the caller's token (7-step pipeline), so a token
# revoked mid-task is rejected on the very next contribution.
Contributor = Annotated[VerificationResult, Depends(require_capability(ACTION))]


def _key(task_id: str) -> str:
    return f"task:{task_id}:contributions"


def _ack(task_id: str, v: VerificationResult, count: int) -> CollabAck:
    return CollabAck(
        accepted=True,
        task_id=task_id,
        verified_by=v.verified_by,
        issuer=v.issuer,
        jti=v.jti,
        verification_ms=v.duration_ms,
        contributions=count,
    )


@router.post("/join", response_model=CollabAck)
async def join_task(
    body: JoinRequest, v: Contributor, db: DbSession, redis: RedisClient
) -> CollabAck:
    detail = {
        "task_id": body.task_id,
        "agent": body.agent_name,
        "task_role": body.task_role,
        "issuer": v.issuer,
        "jti": v.jti,
        "subject": (v.claims or {}).get("sub"),
        "verification_ms": v.duration_ms,
    }
    record_event(db, AuditEventType.TASK_JOIN_REQUESTED, detail=detail)
    record_event(db, AuditEventType.TASK_ASSIGNED, detail=detail)
    await db.commit()
    count = await redis.llen(_key(body.task_id))
    return _ack(body.task_id, v, count)


@router.post("/contribute", response_model=CollabAck)
async def contribute(
    body: ContributionRequest, v: Contributor, db: DbSession, redis: RedisClient
) -> CollabAck:
    entry = {
        "agent": body.agent_name,
        "kind": body.kind,
        "content": body.content,
        "issuer": v.issuer,
        "jti": v.jti,
        "at": datetime.now(UTC).isoformat(),
    }
    key = _key(body.task_id)
    await redis.rpush(key, json.dumps(entry))
    await redis.expire(key, TASK_TTL_SECONDS)
    if body.kind == "summary":
        record_event(
            db,
            AuditEventType.TASK_COMPLETED,
            detail={
                "task_id": body.task_id,
                "agent": body.agent_name,
                "issuer": v.issuer,
                "jti": v.jti,
            },
        )
        await db.commit()
    return _ack(body.task_id, v, await redis.llen(key))


@router.get("/{task_id}/contributions", dependencies=[Depends(require_admin)])
async def list_contributions(task_id: str, redis: RedisClient) -> dict:
    raw = await redis.lrange(_key(task_id), 0, -1)
    return {"task_id": task_id, "contributions": [json.loads(r) for r in raw]}
