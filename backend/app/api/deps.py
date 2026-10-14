import secrets
from typing import Annotated

from fastapi import Depends, Header
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.errors import AppError
from app.core.redis_client import get_redis
from app.db.session import get_db
from app.schemas.token import VerificationResult
from app.services.verification_service import verify_token

settings = get_settings()

DbSession = Annotated[AsyncSession, Depends(get_db)]
RedisClient = Annotated[Redis, Depends(get_redis)]


async def require_admin(x_admin_key: Annotated[str | None, Header()] = None) -> None:
    """Gate for administrative endpoints (issue, revoke, trust, audit)."""
    expected = settings.admin_api_key.encode("utf-8")
    if not x_admin_key or not secrets.compare_digest(
        x_admin_key.encode("utf-8"), expected
    ):
        raise AppError(
            "ADMIN_AUTH_REQUIRED", "Missing or invalid X-Admin-Key header.", 401
        )


def require_capability(action: str):
    """
    Verification middleware as a dependency: the request must carry a valid
    capability token (Authorization: Bearer ...) permitting `action`.
    401 for any token problem, 403 when the token is valid but lacks the scope.
    """

    async def dependency(
        db: DbSession,
        redis: RedisClient,
        authorization: Annotated[str | None, Header()] = None,
    ) -> VerificationResult:
        if not authorization or not authorization.lower().startswith("bearer "):
            raise AppError(
                "MISSING_BEARER_TOKEN",
                "Authorization header with a Bearer token is required.",
                401,
            )
        token = authorization[7:].strip()
        result = await verify_token(db, redis, token, required_action=action)
        if not result.valid:
            status = 403 if result.reason_code == "INSUFFICIENT_SCOPE" else 401
            raise AppError(
                result.reason_code or "UNAUTHORIZED",
                "Capability token rejected.",
                status,
                details={"verification": result.model_dump(mode="json")},
            )
        return result

    return dependency
