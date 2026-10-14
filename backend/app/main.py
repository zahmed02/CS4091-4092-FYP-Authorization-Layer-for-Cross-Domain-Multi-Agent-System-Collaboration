"""
FastAPI application factory for the Authorization Layer service.

Each trust domain (domain-a, domain-b) runs this exact same app, started
with a different APP_ENV_FILE and port.
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.api.deps import RedisClient
from app.api.v1.router import api_router
from app.core.config import get_settings
from app.core.errors import AppError
from app.core.redis_client import create_redis_client
from app.db.session import AsyncSessionLocal, engine
from app.services.trust_service import ensure_self_trust_domain

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.redis = create_redis_client()
    async with AsyncSessionLocal() as db:
        await ensure_self_trust_domain(db)
    yield
    await app.state.redis.aclose()
    await engine.dispose()


def create_app() -> FastAPI:
    app = FastAPI(
        title="Authorization Layer for Cross Domain Multi Agent System Collaboration",
        description=f"Capability-token authorization service. Trust domain: {settings.trust_domain_id}",
        version="0.2.0",
        lifespan=lifespan,
    )

    @app.exception_handler(AppError)
    async def app_error_handler(_: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "error": {
                    "code": exc.code,
                    "message": exc.message,
                    "details": exc.details,
                }
            },
        )

    app.include_router(api_router)

    @app.get("/health", tags=["system"])
    async def health() -> dict:
        """Liveness check: process is up, config loaded correctly."""
        return {"status": "ok", "trust_domain_id": settings.trust_domain_id}

    @app.get("/health/db", tags=["system"])
    async def health_db() -> dict:
        """Readiness check: confirms DATABASE_URL actually connects."""
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        return {"status": "ok", "database": "reachable"}

    @app.get("/health/redis", tags=["system"])
    async def health_redis(redis: RedisClient) -> dict:
        """Readiness check: confirms REDIS_URL actually connects."""
        return {"status": "ok", "redis": await redis.ping()}

    @app.get("/health/keys", tags=["system"])
    async def health_keys() -> dict:
        """Confirms the Ed25519 signing keypair for this domain is readable."""
        priv_exists = settings.jwt_private_key_full_path.is_file()
        pub_exists = settings.jwt_public_key_full_path.is_file()
        return {
            "status": "ok" if priv_exists and pub_exists else "missing",
            "private_key_path": str(settings.jwt_private_key_full_path),
            "public_key_path": str(settings.jwt_public_key_full_path),
        }

    return app


app = create_app()
