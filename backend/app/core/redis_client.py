import redis.asyncio as aioredis
from fastapi import Request

from app.core.config import get_settings


def create_redis_client() -> aioredis.Redis:
    return aioredis.from_url(get_settings().redis_url, decode_responses=True)


async def get_redis(request: Request) -> aioredis.Redis:
    """FastAPI dependency: the shared Redis client created at startup."""
    return request.app.state.redis
