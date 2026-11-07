"""Shared plumbing for every scenario: structured events, pacing and the live
controller. Nothing here knows about a specific scenario."""

from __future__ import annotations

import asyncio
import json
import os
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from app.agents.client import DomainClient, Reply

URL_A = os.environ.get("DOMAIN_A_URL", "http://127.0.0.1:9001")
URL_B = os.environ.get("DOMAIN_B_URL", "http://127.0.0.1:9002")
ACTIONS = ["task:contribute"]

# Event kinds: info | issue | stage | wait | llm | verdict | revoke | abort |
# summary | done


@dataclass
class Event:
    seq: int
    t: float
    actor: str
    kind: str
    message: str
    data: dict[str, Any] = field(default_factory=dict)

    def as_dict(self) -> dict[str, Any]:
        return {
            "seq": self.seq,
            "t": round(self.t, 3),
            "actor": self.actor,
            "kind": self.kind,
            "message": self.message,
            "data": self.data,
        }


@dataclass
class Outcome:
    exit_code: int
    summary: str | None = None


Sink = Callable[[Event], None]


class Reporter:
    def __init__(self, sink: Sink) -> None:
        self._sink = sink
        self._t0 = time.perf_counter()
        self._seq = 0

    @property
    def elapsed(self) -> float:
        return time.perf_counter() - self._t0

    def emit(self, actor: str, kind: str, message: str, **data: Any) -> Event:
        ev = Event(self._seq, self.elapsed, actor, kind, message, data)
        self._seq += 1
        self._sink(ev)
        return ev

    def stage(self, role: str, home: str, stage: str, note: str = "") -> None:
        """An agent moved to a new stage of its life in the task."""
        self.emit(
            f"{role}@{home}",
            "stage",
            note or f"{role} is now {stage}",
            role=role,
            domain=home,
            stage=stage,
        )

    def verdict(self, actor: str, domain: str, what: str, r: Reply) -> bool:
        if r.ok:
            b = r.body
            self.emit(
                actor,
                "verdict",
                f"{what}: ACCEPTED by {b['verified_by']} (issuer {b['issuer']}, "
                f"verify {b['verification_ms']:.2f} ms, round trip {r.elapsed_ms:.0f} ms)",
                accepted=True,
                domain=domain,
                what=what,
                status=r.status,
                verified_by=b["verified_by"],
                issuer=b["issuer"],
                verification_ms=b["verification_ms"],
                round_trip_ms=round(r.elapsed_ms, 1),
                jti=b.get("jti"),
            )
            return True
        err = r.body.get("error", {})
        ver = (err.get("details") or {}).get("verification") or {}
        steps = ver.get("steps", [])
        failed = [s["name"] for s in steps if not s.get("passed")]
        self.emit(
            actor,
            "verdict",
            f"{what}: REJECTED HTTP {r.status} {err.get('code')} "
            f"(failed step: {', '.join(failed) or 'n/a'})",
            accepted=False,
            domain=domain,
            what=what,
            status=r.status,
            code=err.get("code"),
            failed_steps=failed,
            steps=steps,
            round_trip_ms=round(r.elapsed_ms, 1),
        )
        return False


class Control:
    """Pacing and live commands for one run.

    fast: no pauses (the CLI and tests). slow: a pause between steps.
    step: stop before every step until the presenter selects Next."""

    MODES = ("fast", "slow", "step")

    def __init__(self, mode: str = "fast", pace_s: float = 1.8) -> None:
        if mode not in self.MODES:
            raise ValueError(f"mode must be one of {self.MODES}")
        self.mode = mode
        self.pace_s = pace_s
        self.waiting: str | None = None
        self._go = asyncio.Event()
        self._revokes: dict[str, str] = {}

    def set_mode(self, mode: str) -> None:
        if mode not in self.MODES:
            raise ValueError(f"mode must be one of {self.MODES}")
        self.mode = mode
        if mode != "step":
            self._go.set()

    def next(self) -> None:
        self._go.set()

    def request_revoke(
        self, role: str, reason: str = "live: revoked by the controller"
    ) -> None:
        self._revokes.setdefault(role, reason)

    def drain_revokes(self) -> dict[str, str]:
        out, self._revokes = self._revokes, {}
        return out

    async def beat(self, rep: Reporter, label: str) -> None:
        """Called before each step. Pauses according to the current mode."""
        if self.mode == "fast":
            return
        if self.mode == "slow":
            await asyncio.sleep(self.pace_s)
            return
        self._go.clear()
        self.waiting = label
        rep.emit("controller", "wait", f"Next: {label}", label=label)
        await self._go.wait()
        self.waiting = None


@dataclass
class TokenRec:
    role: str
    home: str  # issuing domain id, e.g. "domain-a"
    jti: str
    token: str
    revoked: bool = False


async def apply_live_revokes(
    rep: Reporter,
    ctl: Control,
    tokens: dict[str, TokenRec],
    clients: dict[str, DomainClient],
) -> list[str]:
    """Revoke every agent the presenter asked for since the last check."""
    done: list[str] = []
    for role, reason in ctl.drain_revokes().items():
        tok = tokens.get(role)
        if tok is None:
            rep.emit(
                "controller",
                "info",
                f"Revoke requested for '{role}', but that agent has no token yet.",
            )
            continue
        if tok.revoked:
            continue
        rev = await clients[tok.home].revoke(tok.jti, reason)
        tok.revoked = True
        rep.emit(
            f"{tok.home} (admin)",
            "revoke",
            f"REVOKED {role} token, HTTP {rev.status}, "
            f"propagation={json.dumps(rev.body.get('propagation'))}",
            jti=tok.jti,
            role=role,
            status=rev.status,
            propagation=rev.body.get("propagation"),
        )
        rep.stage(role, tok.home, "revoked", f"{role} was revoked")
        done.append(role)
    return done
