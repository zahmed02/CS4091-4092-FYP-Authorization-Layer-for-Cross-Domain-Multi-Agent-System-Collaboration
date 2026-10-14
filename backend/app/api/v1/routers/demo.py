from typing import Annotated

from fastapi import APIRouter, Depends

from app.api.deps import require_capability
from app.schemas.token import VerificationResult

router = APIRouter(prefix="/demo", tags=["demo"])


@router.get("/protected")
async def protected(
    result: Annotated[VerificationResult, Depends(require_capability("demo:read"))],
) -> dict:
    """Throwaway route proving the verification middleware gates real requests."""
    claims = result.claims or {}
    return {
        "message": "Access granted by capability token.",
        "verified_by": result.verified_by,
        "issuer": result.issuer,
        "team": claims.get("sub"),
        "role": claims.get("role"),
        "verification_ms": result.duration_ms,
    }
