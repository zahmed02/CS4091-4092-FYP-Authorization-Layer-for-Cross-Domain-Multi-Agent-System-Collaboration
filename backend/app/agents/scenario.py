"""Cross-domain collaboration scenarios, shared by the CLI (run_demo) and the
dashboard (scenarios router). Every step is reported as a structured event, so
both front ends show the same thing.

Scenarios: normal, revoke, scope, expired (two agents) and team (four agents).
Pacing, step mode and live revocation come from the Control object."""

from __future__ import annotations

import asyncio
import re
import uuid
from dataclasses import dataclass, field
from typing import Any

from dotenv import dotenv_values

from app.agents import llm, prompts
from app.agents.client import ENV_DIR, DomainClient, Reply
from app.agents.researcher import TOPIC, ResearcherAgent
from app.agents.runtime import (
    ACTIONS,
    URL_A,
    URL_B,
    Control,
    Event,
    Outcome,
    Reporter,
    Sink,
    TokenRec,
    apply_live_revokes,
)
from app.agents.writer import WriterAgent

__all__ = [
    "EXPIRY_TTL_S",
    "SCENARIOS",
    "Control",
    "Event",
    "Outcome",
    "execute",
    "load_groq_key",
]

SCENARIOS = ("normal", "revoke", "scope", "expired", "team")
FOCUS = "authorization, token verification and revocation across trust domains"
FACT_COUNT = 4
EXPIRY_TTL_S = 3
DEFAULT_CLOCK_SKEW_S = 5


def load_groq_key() -> str | None:
    return llm.load_settings().api_key


def clock_skew_seconds() -> int:
    """Domain B's expiry grace period, read from its env file so the scenario
    waits exactly as long as the backend really tolerates."""
    raw = dotenv_values(ENV_DIR / "domain-b.env").get("CLOCK_SKEW_SECONDS")
    try:
        return int(raw) if raw else DEFAULT_CLOCK_SKEW_S
    except ValueError:
        return DEFAULT_CLOCK_SKEW_S


@dataclass
class Ctx:
    rep: Reporter
    ctl: Control
    a: DomainClient
    b: DomainClient
    task_id: str
    sfx: str
    topic: str
    tokens: dict[str, TokenRec] = field(default_factory=dict)
    revoked_live: bool = False

    @property
    def clients(self) -> dict[str, DomainClient]:
        return {"domain-a": self.a, "domain-b": self.b}

    async def step(self, label: str) -> None:
        """Pause as the presenter wants, then apply any pending revocation."""
        await self.ctl.beat(self.rep, label)
        if await apply_live_revokes(self.rep, self.ctl, self.tokens, self.clients):
            self.revoked_live = True

    async def issue(
        self,
        home: str,
        role: str,
        actions: list[str],
        audience: list[str],
        *,
        ttl: int = 600,
        **extra: Any,
    ) -> TokenRec:
        client = self.clients[home]
        team = await client.create_team(f"{role}-team-{self.sfx}")
        tok = await client.issue_token(team, role, actions, audience, ttl=ttl)
        rec = TokenRec(role, home, tok["jti"], tok["token"])
        self.tokens[role] = rec
        self.rep.emit(
            home,
            "issue",
            f"issued {role} token jti={tok['jti']} aud={tok['audience']}",
            domain=home,
            role=role,
            jti=tok["jti"],
            audience=tok["audience"],
            actions=actions,
            expires_at=tok.get("expires_at"),
            token=tok["token"],
            **extra,
        )
        self.rep.stage(role, home, "issued", f"{role} received a token from {home}")
        return rec

    def judge(
        self, role: str, target: str, what: str, r: Reply, ok_stage: str | None = None
    ) -> bool:
        """Report the verdict and move the agent to its next stage."""
        home = self.tokens[role].home
        ok = self.rep.verdict(f"{role}@{home}", target, what, r)
        if ok:
            if ok_stage:
                self.rep.stage(role, home, ok_stage)
            return True
        code = (r.body.get("error") or {}).get("code")
        if code == "TOKEN_REVOKED" and self.tokens[role].revoked:
            return False  # the controller already moved this agent to "revoked"
        stage = "expired" if code == "TOKEN_EXPIRED" else "refused"
        self.rep.stage(role, home, stage, f"{role} was refused: {code}")
        return False

    def working(self, role: str, home: str) -> None:
        """Mark an agent as working, unless it was just revoked."""
        if not self.tokens[role].revoked:
            self.rep.stage(role, home, "working")

    async def contributions(self, domain: str, kind: str | None = None) -> list[dict]:
        rows = await self.clients[domain].contributions(self.task_id)
        return [c for c in rows if kind is None or c["kind"] == kind]

    async def ask(
        self,
        actor: str,
        purpose: str,
        system: str,
        user: str,
        fallback: str | None,
    ) -> tuple[str | None, str]:
        """One LLM call with its token use reported; falls back when the model
        is unavailable. Returns (text, mode)."""
        if not llm.available():
            self.rep.emit(
                actor,
                "info",
                f"{purpose}: no GROQ_API_KEY set, using the built-in fallback",
                purpose=purpose,
                fallback=True,
            )
            return fallback, "template (no GROQ_API_KEY set)"
        settings = llm.load_settings()
        self.rep.emit(
            actor,
            "llm",
            f"{purpose}: asking {settings.model}",
            purpose=purpose,
            model=settings.model,
            phase="start",
        )
        try:
            res = await llm.complete(system, user)
        except llm.LlmError as exc:
            self.rep.emit(
                actor,
                "llm",
                f"{purpose}: model unavailable ({exc}); using the built-in fallback",
                purpose=purpose,
                model=settings.model,
                phase="failed",
                error=str(exc),
            )
            return fallback, f"template (LLM failed: {exc})"
        self.rep.emit(
            actor,
            "llm",
            f"{purpose}: {res.model} answered in {res.latency_ms:.0f} ms, "
            f"{res.total_tokens} tokens",
            purpose=purpose,
            model=res.model,
            phase="done",
            latency_ms=round(res.latency_ms, 1),
            prompt_tokens=res.prompt_tokens,
            completion_tokens=res.completion_tokens,
            total_tokens=res.total_tokens,
        )
        return res.text, f"groq {res.model}"


def parse_facts(text: str, n: int) -> list[str]:
    """Turn the model's reply into clean one-line facts."""
    out: list[str] = []
    for line in text.splitlines():
        line = re.sub(r"^\s*(?:[-*•]|\d+[.)])\s*", "", line).strip()
        if 12 <= len(line) <= 300:
            out.append(line)
    return out[:n]


async def gather_facts(ctx: Ctx, researcher: ResearcherAgent) -> list[str]:
    actor = "researcher@domain-a"
    ctx.rep.stage("researcher", "domain-a", "researching")
    fallback = researcher.research()
    text, mode = await ctx.ask(
        actor,
        "research notes",
        prompts.FACTS_SYSTEM,
        prompts.facts_user(ctx.topic, FOCUS, FACT_COUNT),
        None,
    )
    facts = parse_facts(text, FACT_COUNT) if text else []
    if len(facts) < 3:
        if text:
            ctx.rep.emit(
                actor,
                "info",
                "model reply had too few usable lines; using built-in notes",
            )
        return fallback
    ctx.rep.emit(
        actor,
        "info",
        f"researcher wrote {len(facts)} notes via {mode}",
        mode=mode,
        count=len(facts),
    )
    return facts


async def _finish_aborted(ctx: Ctx, total: int, who: str) -> None:
    kept = await ctx.contributions("domain-b", "fact")
    ctx.rep.emit(
        "orchestrator",
        "abort",
        f"TASK ABORTED. Domain B holds {len(kept)} of {total} facts; "
        f"writer does not start on incomplete research ({who}).",
        stored=len(kept),
        total=total,
    )


# --- two-agent scenarios ----------------------------------------------------


async def _pair(ctx: Ctx, scenario: str, revoke_after: int) -> Outcome:
    rep = ctx.rep
    researcher, writer = ResearcherAgent(), WriterAgent()

    await ctx.step(
        "Domain A issues the researcher token, Domain B issues the writer token"
    )
    r_tok = await ctx.issue("domain-a", "researcher", ACTIONS, ["domain-b"])
    w_tok = await ctx.issue("domain-b", "writer", ACTIONS, ["domain-a"])

    await ctx.step("Researcher joins Domain B")
    ok1 = ctx.judge(
        "researcher",
        "domain-b",
        "join domain-b",
        await ctx.b.join(
            r_tok.token, ctx.task_id, researcher.name, researcher.task_role
        ),
        "joined",
    )
    await ctx.step("Writer joins Domain A")
    ok2 = ctx.judge(
        "writer",
        "domain-a",
        "join domain-a",
        await ctx.a.join(w_tok.token, ctx.task_id, writer.name, writer.task_role),
        "joined",
    )
    if not (ok1 and ok2):
        return Outcome(1)

    await ctx.step("Researcher gathers notes")
    facts = await gather_facts(ctx, researcher)
    ctx.working("researcher", "domain-a")
    rep.stage("writer", "domain-b", "waiting", "writer waits for the research")

    for i, fact in enumerate(facts):
        if scenario == "revoke" and i == revoke_after:
            ctx.ctl.request_revoke(
                "researcher", "demo: researcher compromised mid-task"
            )
        await ctx.step(f"Researcher sends fact {i + 1} of {len(facts)} to Domain B")
        if not ctx.judge(
            "researcher",
            "domain-b",
            f"fact {i + 1}/{len(facts)} -> domain-b",
            await ctx.b.contribute(
                r_tok.token, ctx.task_id, researcher.name, "fact", fact
            ),
        ):
            await _finish_aborted(ctx, len(facts), "researcher refused")
            return Outcome(0 if scenario == "revoke" or ctx.revoked_live else 1)

    rep.stage("researcher", "domain-a", "done", "researcher delivered every fact")
    await ctx.step("Writer reads the facts and writes the summary")
    ctx.working("writer", "domain-b")
    stored = [c["content"] for c in await ctx.contributions("domain-b", "fact")]
    text, mode = await ctx.ask(
        "writer@domain-b",
        "summary",
        prompts.SUMMARY_SYSTEM,
        prompts.summary_user(ctx.topic, stored),
        writer.fallback(ctx.topic, stored),
    )
    text = text or writer.fallback(ctx.topic, stored)
    rep.emit("writer@domain-b", "info", f"summary written via {mode}", mode=mode)

    await ctx.step("Writer sends the summary to Domain A")
    if not ctx.judge(
        "writer",
        "domain-a",
        "summary -> domain-a",
        await ctx.a.contribute(w_tok.token, ctx.task_id, writer.name, "summary", text),
        "done",
    ):
        rep.emit("orchestrator", "abort", "TASK ABORTED. The summary was refused.")
        return Outcome(0 if ctx.revoked_live else 1)
    rep.emit("writer@domain-b", "summary", "final summary", text=text, mode=mode)
    rep.emit(
        "orchestrator",
        "done",
        f"TASK COMPLETED in {rep.elapsed:.2f}s",
        elapsed_s=round(rep.elapsed, 2),
    )
    return Outcome(0 if scenario == "normal" else 1, text)


async def _scope(ctx: Ctx) -> Outcome:
    """Least privilege: a read-only token may read, but cannot join or write."""
    await ctx.step("Domain A issues a read-only auditor token")
    tok = await ctx.issue("domain-a", "auditor", ["demo:read"], ["domain-b"])
    await ctx.step("Auditor reads a protected resource at Domain B")
    read_ok = ctx.judge(
        "auditor",
        "domain-b",
        "read protected resource",
        await ctx.b.protected(tok.token),
        "reading",
    )
    await ctx.step("Auditor tries to join the task at Domain B")
    join_ok = ctx.judge(
        "auditor",
        "domain-b",
        "join domain-b",
        await ctx.b.join(tok.token, ctx.task_id, "auditor-agent", "audit"),
    )
    await ctx.step("Auditor tries to write a fact to Domain B")
    write_ok = ctx.judge(
        "auditor",
        "domain-b",
        "write fact -> domain-b",
        await ctx.b.contribute(
            tok.token, ctx.task_id, "auditor-agent", "fact", "unauthorised write"
        ),
    )
    kept = await ctx.contributions("domain-b")
    ctx.rep.emit(
        "orchestrator",
        "done",
        f"SCOPE ENFORCED: read allowed={read_ok}, join allowed={join_ok}, "
        f"write allowed={write_ok}, facts stored in domain-b={len(kept)}.",
        elapsed_s=round(ctx.rep.elapsed, 2),
    )
    return Outcome(0 if read_ok and not join_ok and not write_ok and not kept else 1)


async def _expired(ctx: Ctx) -> Outcome:
    """A short-lived token works at first, then is refused once it expires.

    The verifier allows a small clock-skew grace period after `exp`, so the
    refusal only comes after lifetime + grace."""
    rep = ctx.rep
    researcher = ResearcherAgent()
    skew = clock_skew_seconds()
    await ctx.step("Domain A issues a token that lives 3 seconds")
    tok = await ctx.issue(
        "domain-a",
        "researcher",
        ACTIONS,
        ["domain-b"],
        ttl=EXPIRY_TTL_S,
        ttl_seconds=EXPIRY_TTL_S,
        grace_seconds=skew,
    )
    await ctx.step("Researcher joins Domain B")
    if not ctx.judge(
        "researcher",
        "domain-b",
        "join domain-b",
        await ctx.b.join(tok.token, ctx.task_id, researcher.name, researcher.task_role),
        "joined",
    ):
        return Outcome(1)
    ctx.working("researcher", "domain-a")
    rep.emit(
        "orchestrator",
        "info",
        f"researcher keeps working; its token lives {EXPIRY_TTL_S}s "
        f"and Domain B allows {skew}s of clock skew after that",
    )
    await asyncio.sleep(EXPIRY_TTL_S)
    rep.emit(
        "orchestrator",
        "info",
        f"token lifetime ended; still inside the {skew}s clock-skew grace period",
    )
    await asyncio.sleep(skew + 1)
    await ctx.step("Researcher sends a fact with the expired token")
    late = ctx.judge(
        "researcher",
        "domain-b",
        "fact 1 -> domain-b",
        await ctx.b.contribute(
            tok.token, ctx.task_id, researcher.name, "fact", researcher.research()[0]
        ),
    )
    rep.emit(
        "orchestrator",
        "abort" if not late else "done",
        "TASK ABORTED. The expired token was refused; no fact was stored."
        if not late
        else "Expired token was accepted. This should not happen.",
        elapsed_s=round(rep.elapsed, 2),
    )
    return Outcome(0 if not late else 1)


# --- four-agent team --------------------------------------------------------


def _analysis_fallback(facts: list[str]) -> str:
    words = sum(len(f.split()) for f in facts)
    return (
        f"Analysis: {len(facts)} notes received, {words} words in total, "
        f"longest note {max(len(f.split()) for f in facts)} words."
    )


async def _team(ctx: Ctx) -> Outcome:
    """Four agents, two domains. Researcher and reviewer belong to Domain A,
    analyst and writer to Domain B; every hand-over crosses the boundary."""
    rep = ctx.rep
    researcher, writer = ResearcherAgent(), WriterAgent()

    await ctx.step("Both domains issue tokens to their agents")
    r_tok = await ctx.issue("domain-a", "researcher", ACTIONS, ["domain-b"])
    v_tok = await ctx.issue("domain-a", "reviewer", ACTIONS, ["domain-b"])
    n_tok = await ctx.issue("domain-b", "analyst", ACTIONS, ["domain-a"])
    w_tok = await ctx.issue("domain-b", "writer", ACTIONS, ["domain-a"])

    joins = (
        ("researcher", "domain-b", ctx.b, r_tok, researcher.name, researcher.task_role),
        ("analyst", "domain-a", ctx.a, n_tok, "analyst-agent", "analysis"),
        ("writer", "domain-a", ctx.a, w_tok, writer.name, writer.task_role),
        ("reviewer", "domain-b", ctx.b, v_tok, "reviewer-agent", "review"),
    )
    for role, target, client, tok, name, task_role in joins:
        await ctx.step(f"{role.capitalize()} joins {target}")
        if not ctx.judge(
            role,
            target,
            f"join {target}",
            await client.join(tok.token, ctx.task_id, name, task_role),
            "joined",
        ):
            rep.emit("orchestrator", "abort", f"TASK ABORTED. {role} could not join.")
            return Outcome(0 if ctx.revoked_live else 1)

    def abort(who: str) -> Outcome:
        rep.emit(
            "orchestrator",
            "abort",
            f"TASK ABORTED. {who} was refused, so the hand-over chain stops here.",
        )
        return Outcome(0 if ctx.revoked_live else 1)

    # 1. researcher -> domain-b
    await ctx.step("Researcher gathers notes")
    facts = await gather_facts(ctx, researcher)
    ctx.working("researcher", "domain-a")
    for role, home, text in (
        ("analyst", "domain-b", "analyst waits for the research"),
        ("writer", "domain-b", "writer waits for the analysis"),
        ("reviewer", "domain-a", "reviewer waits for the summary"),
    ):
        rep.stage(role, home, "waiting", text)
    for i, fact in enumerate(facts):
        await ctx.step(f"Researcher sends fact {i + 1} of {len(facts)} to Domain B")
        if not ctx.judge(
            "researcher",
            "domain-b",
            f"fact {i + 1}/{len(facts)} -> domain-b",
            await ctx.b.contribute(
                r_tok.token, ctx.task_id, researcher.name, "fact", fact
            ),
        ):
            await _finish_aborted(ctx, len(facts), "researcher refused")
            return abort("researcher")
    rep.stage("researcher", "domain-a", "done", "researcher delivered every fact")

    # 2. analyst reads domain-b, posts to domain-a
    await ctx.step("Analyst reads the facts and writes an analysis")
    ctx.working("analyst", "domain-b")
    stored = [c["content"] for c in await ctx.contributions("domain-b", "fact")]
    analysis, a_mode = await ctx.ask(
        "analyst@domain-b",
        "analysis",
        prompts.ANALYSIS_SYSTEM,
        prompts.analysis_user(ctx.topic, stored),
        _analysis_fallback(stored),
    )
    analysis = analysis or _analysis_fallback(stored)
    await ctx.step("Analyst sends the analysis to Domain A")
    if not ctx.judge(
        "analyst",
        "domain-a",
        "analysis -> domain-a",
        await ctx.a.contribute(
            n_tok.token, ctx.task_id, "analyst-agent", "fact", analysis
        ),
        "done",
    ):
        return abort("analyst")
    rep.emit("analyst@domain-b", "info", f"analysis written via {a_mode}", mode=a_mode)

    # 3. writer combines both, posts the summary to domain-a
    await ctx.step("Writer combines the facts and the analysis into a summary")
    ctx.working("writer", "domain-b")
    notes = [*stored, f"Analyst note: {analysis}"]
    text, mode = await ctx.ask(
        "writer@domain-b",
        "summary",
        prompts.SUMMARY_SYSTEM,
        prompts.summary_user(ctx.topic, notes),
        writer.fallback(ctx.topic, notes),
    )
    text = text or writer.fallback(ctx.topic, notes)
    rep.emit("writer@domain-b", "info", f"summary written via {mode}", mode=mode)
    await ctx.step("Writer sends the summary to Domain A")
    if not ctx.judge(
        "writer",
        "domain-a",
        "summary -> domain-a",
        await ctx.a.contribute(w_tok.token, ctx.task_id, writer.name, "summary", text),
        "done",
    ):
        return abort("writer")
    rep.emit("writer@domain-b", "summary", "final summary", text=text, mode=mode)

    # 4. reviewer reads the summary from domain-a, posts the review to domain-b
    await ctx.step("Reviewer reads the summary and reviews it")
    ctx.working("reviewer", "domain-a")
    held = await ctx.contributions("domain-a", "summary")
    review, r_mode = await ctx.ask(
        "reviewer@domain-a",
        "review",
        prompts.REVIEW_SYSTEM,
        prompts.review_user(ctx.topic, notes, held[-1]["content"] if held else text),
        "NOT REVIEWED: no language model was available.",
    )
    review = review or "NOT REVIEWED: no language model was available."
    await ctx.step("Reviewer sends the review to Domain B")
    if not ctx.judge(
        "reviewer",
        "domain-b",
        "review -> domain-b",
        await ctx.b.contribute(
            v_tok.token, ctx.task_id, "reviewer-agent", "fact", f"REVIEW: {review}"
        ),
        "done",
    ):
        return abort("reviewer")
    rep.emit(
        "reviewer@domain-a",
        "info",
        f"review: {review}",
        mode=r_mode,
        review=review,
    )
    rep.emit(
        "orchestrator",
        "done",
        f"TEAM TASK COMPLETED in {rep.elapsed:.2f}s by 4 agents across 2 domains",
        elapsed_s=round(rep.elapsed, 2),
    )
    return Outcome(0, text)


# --- entry point ------------------------------------------------------------


async def execute(
    scenario: str,
    revoke_after: int,
    sink: Sink,
    *,
    url_a: str = URL_A,
    url_b: str = URL_B,
    task_id: str | None = None,
    topic: str | None = None,
    control: Control | None = None,
) -> Outcome:
    if scenario not in SCENARIOS:
        raise ValueError(f"unknown scenario {scenario!r}")
    rep = Reporter(sink)
    ctl = control or Control("fast")
    a = DomainClient("domain-a", url_a, ENV_DIR / "domain-a.env")
    b = DomainClient("domain-b", url_b, ENV_DIR / "domain-b.env")
    try:
        if not (await a.health() and await b.health()):
            rep.emit(
                "orchestrator",
                "abort",
                "Both backends must be running (ports 9001 and 9002).",
            )
            return Outcome(2)

        sfx = uuid.uuid4().hex[:6]
        task_id = task_id or f"task-{sfx}"
        topic = (topic or "").strip() or TOPIC
        settings = llm.load_settings()
        rep.emit(
            "orchestrator",
            "info",
            f"scenario={scenario} task={task_id} topic='{topic}'",
            scenario=scenario,
            task_id=task_id,
            topic=topic,
            revoke_after=revoke_after,
            pace=ctl.mode,
            llm_model=settings.model if settings.api_key else None,
        )
        ctx = Ctx(rep, ctl, a, b, task_id, sfx, topic)
        if scenario == "scope":
            return await _scope(ctx)
        if scenario == "expired":
            return await _expired(ctx)
        if scenario == "team":
            return await _team(ctx)
        return await _pair(ctx, scenario, revoke_after)
    finally:
        await a.aclose()
        await b.aclose()
