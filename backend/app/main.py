"""
FastAPI application factory for the Authorization Layer service.

Each trust domain (domain-a, domain-b) runs this exact same app, started
with a different APP_ENV_FILE and port.
"""

import redis.asyncio as aioredis
from fastapi import FastAPI
from sqlalchemy import text

from app.core.config import get_settings
from app.db.session import engine

settings = get_settings()


def create_app() -> FastAPI:
    app = FastAPI(
        title="Authorization Layer for Cross Domain Multi Agent System Collaboration",
        description=f"Capability-token authorization service — trust domain: {settings.trust_domain_id}",
        version="0.1.0",
    )

    @app.get("/health", tags=["system"])
    async def health() -> dict:
        """Liveness check — process is up, config loaded correctly."""
        return {"status": "ok", "trust_domain_id": settings.trust_domain_id}

    @app.get("/health/db", tags=["system"])
    async def health_db() -> dict:
        """Readiness check — confirms DATABASE_URL actually connects."""
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        return {"status": "ok", "database": "reachable"}

    @app.get("/health/redis", tags=["system"])
    async def health_redis() -> dict:
        """Readiness check — confirms REDIS_URL actually connects."""
        client = aioredis.from_url(settings.redis_url)
        try:
            pong = await client.ping()
        finally:
            await client.aclose()
        return {"status": "ok", "redis": pong}

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
