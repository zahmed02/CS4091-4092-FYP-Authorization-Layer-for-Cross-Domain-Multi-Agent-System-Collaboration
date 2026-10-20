"""
Application settings loaded from a per-trust-domain .env file.

Which file gets loaded is controlled by the APP_ENV_FILE environment
variable, set in the PowerShell session BEFORE starting uvicorn. This is
what lets the exact same codebase run as two independent trust domains
(domain-a, domain-b) without any code change between them.
"""

import os
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# backend/app/core/config.py -> backend/
BACKEND_DIR = Path(__file__).resolve().parent.parent.parent

_env_file = os.environ.get("APP_ENV_FILE", str(BACKEND_DIR / ".env"))


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=_env_file,
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Identity of this trust domain instance
    trust_domain_id: str

    # Datastores
    database_url: str
    redis_url: str

    # JWT / capability token signing
    jwt_algorithm: str = "EdDSA"
    jwt_private_key_path: str
    jwt_public_key_path: str

    # Token policy
    token_default_ttl_seconds: int = 900
    token_max_ttl_seconds: int = 3600
    clock_skew_seconds: int = 5

    # Admin API protection (stand-in for Team Manager authentication)
    admin_api_key: str

    # Write an audit row for every verification (can be disabled for benchmarks)
    audit_verifications: bool = True

    # Cross-domain revocation sync.
    # Comma-separated "domain-name=base-url" pairs of peers to notify, e.g.
    #   PEER_ENDPOINTS=domain-b=http://127.0.0.1:9002
    peer_endpoints: str = ""
    peer_sync_timeout_seconds: float = 3.0
    revocation_notice_ttl_seconds: int = 300

    # Service
    app_port: int = 8000
    log_level: str = "INFO"

    # Optional, filled in later when the CrewAI orchestrator is wired up
    llm_provider: str | None = None
    openai_api_key: str | None = None

    @property
    def jwt_private_key_full_path(self) -> Path:
        return (BACKEND_DIR / self.jwt_private_key_path).resolve()

    @property
    def jwt_public_key_full_path(self) -> Path:
        return (BACKEND_DIR / self.jwt_public_key_path).resolve()

    @property
    def peer_endpoint_map(self) -> dict[str, str]:
        """Parsed PEER_ENDPOINTS as {peer domain name: base url}."""
        peers: dict[str, str] = {}
        for item in self.peer_endpoints.split(","):
            item = item.strip()
            if not item or "=" not in item:
                continue
            name, url = item.split("=", 1)
            name, url = name.strip(), url.strip().rstrip("/")
            if name and url and name != self.trust_domain_id:
                peers[name] = url
        return peers


@lru_cache
def get_settings() -> Settings:
    return Settings()
