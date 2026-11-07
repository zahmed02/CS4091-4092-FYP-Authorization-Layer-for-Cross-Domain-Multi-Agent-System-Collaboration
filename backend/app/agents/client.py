from __future__ import annotations

import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import httpx
from dotenv import dotenv_values

REPO_ROOT = Path(__file__).resolve().parents[3]
ENV_DIR = REPO_ROOT / "infra" / "docker"
API = "/api/v1"


@dataclass
class Reply:
    status: int
    body: dict[str, Any]
    elapsed_ms: float

    @property
    def ok(self) -> bool:
        return 200 <= self.status < 300


class DomainClient:
    """Talks to one domain's backend. Admin calls use X-Admin-Key read from the
    gitignored env file; agent calls present a capability token."""

    def __init__(self, name: str, base_url: str, env_file: Path) -> None:
        self.name = name
        self.admin_key = dotenv_values(env_file).get("ADMIN_API_KEY") or ""
        if not self.admin_key:
            raise RuntimeError(f"ADMIN_API_KEY missing in {env_file}")
        self._http = httpx.AsyncClient(base_url=base_url, timeout=15.0)

    async def aclose(self) -> None:
        await self._http.aclose()

    async def health(self) -> bool:
        try:
            return (await self._http.get("/health")).status_code == 200
        except httpx.HTTPError:
            return False

    async def _call(
        self,
        method: str,
        path: str,
        *,
        json: Any = None,
        token: str | None = None,
        admin: bool = False,
    ) -> Reply:
        headers: dict[str, str] = {}
        if admin:
            headers["X-Admin-Key"] = self.admin_key
        if token:
            headers["Authorization"] = f"Bearer {token}"
        t0 = time.perf_counter()
        r = await self._http.request(method, API + path, json=json, headers=headers)
        ms = (time.perf_counter() - t0) * 1000
        try:
            body = r.json()
        except ValueError:
            body = {"raw": r.text}
        return Reply(r.status_code, body, ms)

    # admin
    async def create_team(self, name: str) -> str:
        r = await self._call("POST", "/teams", json={"name": name}, admin=True)
        if not r.ok:
            raise RuntimeError(f"create_team failed on {self.name}: {r.body}")
        return r.body["team_id"]

    async def issue_token(
        self,
        team_id: str,
        role: str,
        actions: list[str],
        audience: list[str],
        ttl: int = 600,
    ) -> dict[str, Any]:
        r = await self._call(
            "POST",
            "/tokens/issue",
            admin=True,
            json={
                "team_id": team_id,
                "role": role,
                "permitted_actions": actions,
                "audience_domains": audience,
                "ttl_seconds": ttl,
            },
        )
        if not r.ok:
            raise RuntimeError(f"issue_token failed on {self.name}: {r.body}")
        return r.body

    async def revoke(self, jti: str, reason: str) -> Reply:
        return await self._call(
            "POST", f"/tokens/{jti}/revoke", admin=True, json={"reason": reason}
        )

    async def contributions(self, task_id: str) -> list[dict[str, Any]]:
        r = await self._call("GET", f"/collab/{task_id}/contributions", admin=True)
        return r.body.get("contributions", [])

    # agent calls (token only)
    async def join(self, token: str, task_id: str, agent: str, role: str) -> Reply:
        return await self._call(
            "POST",
            "/collab/join",
            token=token,
            json={"task_id": task_id, "agent_name": agent, "task_role": role},
        )

    async def protected(self, token: str) -> Reply:
        return await self._call("GET", "/demo/protected", token=token)

    async def contribute(
        self, token: str, task_id: str, agent: str, kind: str, content: str
    ) -> Reply:
        return await self._call(
            "POST",
            "/collab/contribute",
            token=token,
            json={
                "task_id": task_id,
                "agent_name": agent,
                "kind": kind,
                "content": content,
            },
        )
