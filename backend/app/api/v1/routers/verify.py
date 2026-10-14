from fastapi import APIRouter

from app.api.deps import DbSession, RedisClient
from app.schemas.token import VerificationResult, VerifyRequest
from app.services.verification_service import verify_token

router = APIRouter(prefix="/verify", tags=["verification"])


@router.post("", response_model=VerificationResult)
async def verify_endpoint(
    body: VerifyRequest, db: DbSession, redis: RedisClient
) -> VerificationResult:
    """
    Token introspection: always answers 200 with valid true/false and the full
    step-by-step breakdown. Protected routes use the require_capability
    dependency instead, which answers 401/403.
    """
    return await verify_token(db, redis, body.token, body.required_action)
