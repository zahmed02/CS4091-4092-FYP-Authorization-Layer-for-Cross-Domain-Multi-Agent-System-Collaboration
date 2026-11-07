"""Runs the cross-domain collaboration scenarios for the dashboard.

The browser starts a run, polls for events, and can steer it while it runs
(pace, next step, revoke an agent). Finished runs are saved to demo-runs/ so
they can be replayed later. Admin only: scenarios issue and revoke tokens."""

from __future__ import annotations

import asyncio
import json
import time
import uuid
from collections import OrderedDict
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.agents import llm
from app.agents.client import REPO_ROOT
from app.agents.researcher import TOPIC, ResearcherAgent
from app.agents.scenario import EXPIRY_TTL_S, SCENARIOS, Control, Event, execute
from app.api.deps import require_admin
from app.core.config import get_settings

router = APIRouter(
    prefix="/scenarios", tags=["scenarios"], dependencies=[Depends(require_admin)]
)

MAX_RUNS = 20
RUNS_DIR = REPO_ROOT / "demo-runs"
ROLES = ("researcher", "analyst", "writer", "reviewer", "auditor")

Pace = Literal["fast", "slow", "step"]


class RunRequest(BaseModel):
    scenario: Literal["normal", "revoke", "scope", "expired", "team"] = "normal"
    revoke_after: int = Field(default=1, ge=0, le=50)
    topic: str | None = Field(default=None, max_length=200)
    pace: Pace = "fast"


class ControlRequest(BaseModel):
    mode: Pace


class RevokeRequest(BaseModel):
    role: Literal["researcher", "analyst", "writer", "reviewer", "auditor"]


class Run:
    def __init__(self, run_id: str, body: RunRequest) -> None:
        self.run_id = run_id
        self.scenario = body.scenario
        self.revoke_after = body.revoke_after
        self.topic = (body.topic or "").strip() or TOPIC
        self.control = Control(body.pace)
        self.status = "running"
        self.exit_code: int | None = None
        self.error: str | None = None
        self.started_at = time.time()
        self.events: list[dict] = []

    def add(self, ev: Event) -> None:
        self.events.append(ev.as_dict())

    def summary(self) -> dict:
        return {
            "run_id": self.run_id,
            "scenario": self.scenario,
            "topic": self.topic,
            "status": self.status,
            "exit_code": self.exit_code,
            "started_at": self.started_at,
            "event_count": len(self.events),
            "duration_s": self.events[-1]["t"] if self.events else 0,
        }

    def save(self) -> None:
        try:
            RUNS_DIR.mkdir(exist_ok=True)
            doc = {
                **self.summary(),
                "revoke_after": self.revoke_after,
                "error": self.error,
                "events": self.events,
            }
            (RUNS_DIR / f"{self.run_id}.json").write_text(
                json.dumps(doc), encoding="utf-8"
            )
        except OSError:
            pass  # a full disk must not break a live demo


_runs: OrderedDict[str, Run] = OrderedDict()
_tasks: set[asyncio.Task] = set()


def _live(run_id: str) -> Run:
    run = _runs.get(run_id)
    if run is None:
        raise HTTPException(404, "Unknown run. It may be saved: use GET /runs/{id}.")
    if run.status != "running":
        raise HTTPException(409, "This run has already ended.")
    return run


async def _drive(run: Run) -> None:
    try:
        outcome = await execute(
            run.scenario,
            run.revoke_after,
            run.add,
            task_id=run.run_id,
            topic=run.topic,
            control=run.control,
        )
        run.exit_code = outcome.exit_code
        run.status = "completed"
    except Exception as exc:  # noqa: BLE001 - report to the dashboard instead of dying
        run.error = f"{type(exc).__name__}: {exc}"
        run.status = "failed"
    finally:
        run.control.waiting = None
        run.save()


def _saved() -> list[dict]:
    if not RUNS_DIR.is_dir():
        return []
    out = []
    for path in RUNS_DIR.glob("task-*.json"):
        try:
            doc = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        doc.pop("events", None)
        doc.pop("error", None)
        out.append(doc)
    return out


@router.get("/config")
async def config() -> dict:
    """What the next run will use, so the dashboard shows it before starting."""
    s = llm.load_settings()
    return {
        "scenarios": list(SCENARIOS),
        "roles": list(ROLES),
        "default_topic": TOPIC,
        "fact_count": len(ResearcherAgent().research()),
        "llm_enabled": s.api_key is not None,
        "llm_model": s.model,
        "writer_mode": "groq" if s.api_key else "template",
        "active_runs": sum(r.status == "running" for r in _runs.values()),
        "expiry_ttl_seconds": EXPIRY_TTL_S,
        "clock_skew_seconds": get_settings().clock_skew_seconds,
    }


@router.post("/run", status_code=202)
async def start(body: RunRequest) -> dict:
    if any(r.status == "running" for r in _runs.values()):
        raise HTTPException(409, "A scenario is already running. Wait for it to end.")
    run_id = f"task-{uuid.uuid4().hex[:6]}"
    run = Run(run_id, body)
    _runs[run_id] = run
    while len(_runs) > MAX_RUNS:
        _runs.popitem(last=False)
    task = asyncio.create_task(_drive(run))
    _tasks.add(task)
    task.add_done_callback(_tasks.discard)
    return {"run_id": run_id, "pace": body.pace}


@router.get("/runs")
async def history() -> dict:
    """Saved runs, newest first, for the replay list."""
    rows = {r["run_id"]: r for r in _saved()}
    for run in _runs.values():
        rows[run.run_id] = run.summary()
    ordered = sorted(rows.values(), key=lambda r: r.get("started_at", 0), reverse=True)
    return {"runs": ordered}


@router.get("/runs/{run_id}")
async def poll(run_id: str, after: int = -1) -> dict:
    run = _runs.get(run_id)
    if run is not None:
        return {
            "run_id": run.run_id,
            "scenario": run.scenario,
            "topic": run.topic,
            "revoke_after": run.revoke_after,
            "status": run.status,
            "exit_code": run.exit_code,
            "error": run.error,
            "mode": run.control.mode,
            "waiting": run.control.waiting,
            "started_at": run.started_at,
            "events": [e for e in run.events if e["seq"] > after],
        }
    path = RUNS_DIR / f"{run_id}.json"
    if not run_id.startswith("task-") or not path.is_file():
        raise HTTPException(404, "Unknown run.")
    doc = json.loads(path.read_text(encoding="utf-8"))
    doc["mode"], doc["waiting"] = "fast", None
    doc["events"] = [e for e in doc["events"] if e["seq"] > after]
    return doc


@router.post("/runs/{run_id}/control")
async def set_mode(run_id: str, body: ControlRequest) -> dict:
    run = _live(run_id)
    run.control.set_mode(body.mode)
    return {"mode": run.control.mode}


@router.post("/runs/{run_id}/next")
async def next_step(run_id: str) -> dict:
    run = _live(run_id)
    run.control.next()
    return {"waiting": run.control.waiting}


@router.post("/runs/{run_id}/revoke")
async def revoke_agent(run_id: str, body: RevokeRequest) -> dict:
    """Revoke an agent's token. It takes effect before the agent's next step."""
    run = _live(run_id)
    run.control.request_revoke(body.role)
    return {"requested": body.role}
