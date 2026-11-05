import os

import psutil
from fastapi import APIRouter, Depends

from app.api.deps import RedisClient, require_admin
from app.core.config import get_settings

router = APIRouter(
    prefix="/metrics",
    tags=["metrics"],
    dependencies=[Depends(require_admin)],
)


@router.get("/process")
async def process_metrics(redis: RedisClient) -> dict:
    """Server-side memory figures used by the benchmark harness.

    rss_bytes is the resident memory of the process answering this request.
    The Redis figures separate stored data (dataset, keys) from connection
    buffers, so state growth can be told apart from traffic growth.
    """
    proc = psutil.Process(os.getpid())
    mem = await redis.info("memory")
    return {
        "pid": proc.pid,
        "rss_bytes": proc.memory_info().rss,
        "threads": proc.num_threads(),
        "redis_used_memory_bytes": int(mem.get("used_memory", 0)),
        "redis_dataset_bytes": int(mem.get("used_memory_dataset", 0)),
        "redis_keys": int(await redis.dbsize()),
        "audit_verifications": get_settings().audit_verifications,
    }
