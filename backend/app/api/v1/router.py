from fastapi import APIRouter

from app.api.v1.routers import audit, demo, teams, tokens, trust, verify

api_router = APIRouter(prefix="/api/v1")

for _router in (
    trust.router,
    teams.router,
    tokens.router,
    verify.router,
    demo.router,
    audit.router,
):
    api_router.include_router(_router)
