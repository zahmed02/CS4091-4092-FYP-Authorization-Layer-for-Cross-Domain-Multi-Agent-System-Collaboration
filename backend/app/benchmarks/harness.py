"""Benchmark harness for the authorization layer.

An "agent" here is a token holder: it presents a capability token issued by
Domain A to Domain B. Domain B keeps no per-agent state, so the harness
simulates agents as asyncio tasks that reuse a small set of team tokens
(t = TEAM_COUNT). No LLM is involved anywhere in the benchmarks.

Benchmarks, each writes CSV files to <repo>/benchmarks/results[/<tag>]:
  1. memory scaling        memory_scaling.csv
  2. dynamic join latency  join_latency_raw.csv, join_latency_summary.csv
     and a load sweep      join_rate_sweep.csv
  3. verification overhead verification_overhead.csv, verification_steps.csv
  4. throughput            throughput.csv
plus summary.json with pass/fail against the proposal targets.

A request that fails at the connection level is recorded with status 0 and
counted as an error instead of aborting the run.
"""

from __future__ import annotations

import asyncio
import json
import os
import platform
import random
import time
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import httpx
import pandas as pd

from app.agents.client import ENV_DIR, REPO_ROOT, DomainClient
from app.benchmarks import baseline

URL_A = os.environ.get("DOMAIN_A_URL", "http://127.0.0.1:9001")
URL_B = os.environ.get("DOMAIN_B_URL", "http://127.0.0.1:9002")
API = "/api/v1"

RESULTS_DIR: Path = REPO_ROOT / "benchmarks" / "results"
CHARTS_DIR: Path = REPO_ROOT / "benchmarks" / "charts"

DEFAULT_SIZES = [10, 50, 100, 250, 500]
DEFAULT_JOIN_RATE = 20.0
DEFAULT_SWEEP_AGENTS = 200
DEFAULT_SWEEP_RATES = [10.0, 25.0, 50.0, 100.0, 200.0]
TEAM_COUNT = 5
ACTIONS = ["demo:read", "task:contribute"]
MEMORY_CONCURRENCY = 20
OVERHEAD_SAMPLES = 300
BASELINE_ATTRIBUTES = 8
BASELINE_REVOCATIONS = 100

# Proposal targets
LIMIT_MEMORY_PCT = 5.0
LIMIT_JOIN_P95_MS = 100.0
LIMIT_OVERHEAD_PCT = 15.0
LIMIT_THROUGHPUT_DROP_PCT = 20.0
THROUGHPUT_REFERENCE_AGENTS = 100


def set_output_tag(tag: str) -> None:
    """Write results and charts into a sub folder, e.g. to keep an ablation run."""
    global RESULTS_DIR, CHARTS_DIR
    base = REPO_ROOT / "benchmarks"
    RESULTS_DIR = base / "results" / tag if tag else base / "results"
    CHARTS_DIR = base / "charts" / tag if tag else base / "charts"


@dataclass
class Context:
    a: DomainClient
    b: DomainClient
    tokens: list[str]
    token_bytes: int
    issue_ms: list[float]
    server: dict[str, Any] = field(default_factory=dict)


class _NoResponse:
    """Stands in for a response when the connection itself failed."""

    status_code = 0

    def json(self) -> Any:
        raise ValueError("no response")


_NO_RESPONSE = _NoResponse()


def log(msg: str) -> None:
    print(f"[bench] {msg}", flush=True)


def _client(base_url: str, max_connections: int) -> httpx.AsyncClient:
    # keepalive_expiry stays below uvicorn's 5 s keep-alive timeout so the
    # client never reuses a connection the server is just closing.
    limits = httpx.Limits(
        max_connections=max_connections,
        max_keepalive_connections=max_connections,
        keepalive_expiry=2.0,
    )
    return httpx.AsyncClient(base_url=base_url, timeout=60.0, limits=limits)


async def _timed(
    client: httpx.AsyncClient,
    method: str,
    path: str,
    token: str | None = None,
    body: dict[str, Any] | None = None,
) -> tuple[Any, float]:
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    t0 = time.perf_counter()
    try:
        resp = await client.request(method, path, headers=headers, json=body)
    except httpx.TransportError:
        return _NO_RESPONSE, (time.perf_counter() - t0) * 1000
    return resp, (time.perf_counter() - t0) * 1000


def _join_body(task_id: str, index: int) -> dict[str, str]:
    return {
        "task_id": task_id,
        "agent_name": f"bench-agent-{index}",
        "task_role": "benchmark",
    }


async def _metrics(client: httpx.AsyncClient, admin_key: str) -> dict[str, Any]:
    resp = await client.get(
        API + "/metrics/process", headers={"X-Admin-Key": admin_key}
    )
    resp.raise_for_status()
    return resp.json()


async def prepare() -> Context:
    a = DomainClient("domain-a", URL_A, ENV_DIR / "domain-a.env")
    b = DomainClient("domain-b", URL_B, ENV_DIR / "domain-b.env")
    if not (await a.health() and await b.health()):
        await a.aclose()
        await b.aclose()
        raise SystemExit("Both backends must be running (ports 9001 and 9002).")

    async with httpx.AsyncClient(base_url=URL_B, timeout=10.0) as probe:
        resp = await probe.get(
            API + "/metrics/process", headers={"X-Admin-Key": b.admin_key}
        )
    if resp.status_code != 200:
        await a.aclose()
        await b.aclose()
        raise SystemExit(
            f"/api/v1/metrics/process returned HTTP {resp.status_code} on domain-b. "
            "Restart both backends so the new metrics route is loaded."
        )
    server = {"audit_verifications": resp.json().get("audit_verifications")}

    suffix = uuid.uuid4().hex[:6]
    tokens: list[str] = []
    issue_ms: list[float] = []
    for i in range(TEAM_COUNT):
        team_id = await a.create_team(f"bench-team-{suffix}-{i}")
        t0 = time.perf_counter()
        issued = await a.issue_token(
            team_id, "benchmark", ACTIONS, ["domain-b"], ttl=3600
        )
        issue_ms.append((time.perf_counter() - t0) * 1000)
        tokens.append(issued["token"])
    log(
        f"prepared {TEAM_COUNT} teams and tokens (token size {len(tokens[0].encode())} bytes), "
        f"domain-b audit_verifications={server['audit_verifications']}"
    )
    return Context(a, b, tokens, len(tokens[0].encode()), issue_ms, server)


async def _warmup(client: httpx.AsyncClient, tokens: list[str]) -> None:
    """Touch every code path the benchmarks use, so first-use costs stay out of the data."""
    for i in range(100):
        await _timed(client, "GET", API + "/demo/protected", tokens[i % len(tokens)])
    for i in range(50):
        await _timed(
            client,
            "POST",
            API + "/collab/join",
            tokens[i % len(tokens)],
            _join_body("bench-warm", i),
        )
    sem = asyncio.Semaphore(MEMORY_CONCURRENCY)

    async def one(i: int) -> None:
        async with sem:
            await _timed(
                client, "GET", API + "/demo/protected", tokens[i % len(tokens)]
            )
            await _timed(
                client,
                "POST",
                API + "/collab/join",
                tokens[i % len(tokens)],
                _join_body("bench-warm", i),
            )

    await asyncio.gather(*(one(i) for i in range(100)))


# 1. Memory scaling -------------------------------------------------------


async def bench_memory(ctx: Context, sizes: list[int]) -> pd.DataFrame:
    """Fixed concurrency, growing number of distinct agents.

    Concurrency is held constant on purpose so the test isolates state growth
    (what the design claims to avoid) from buffer growth caused by traffic.
    """
    rows: list[dict[str, Any]] = []
    async with _client(URL_B, MEMORY_CONCURRENCY + 10) as c:
        await _warmup(c, ctx.tokens)
        await asyncio.sleep(1.0)
        base = await _metrics(c, ctx.b.admin_key)
        sem = asyncio.Semaphore(MEMORY_CONCURRENCY)

        def row(n: int, m: dict[str, Any], errors: int) -> dict[str, Any]:
            return {
                "agents": n,
                "rss_mib": m["rss_bytes"] / 1048576,
                "rss_delta_bytes": m["rss_bytes"] - base["rss_bytes"],
                "rss_change_pct": (m["rss_bytes"] - base["rss_bytes"])
                / base["rss_bytes"]
                * 100,
                "redis_keys": m["redis_keys"],
                "redis_dataset_bytes": m["redis_dataset_bytes"],
                "redis_used_memory_bytes": m["redis_used_memory_bytes"],
                "baseline_model_bytes": baseline.measure_registry_bytes(
                    n, BASELINE_ATTRIBUTES, BASELINE_REVOCATIONS
                ),
                "errors": errors,
            }

        rows.append(row(0, base, 0))
        for n in sizes:
            task_id = f"bench-mem-{uuid.uuid4().hex[:6]}"

            async def agent(i: int, task_id: str = task_id) -> int:
                tok = ctx.tokens[i % len(ctx.tokens)]
                async with sem:
                    r1, _ = await _timed(
                        c, "POST", API + "/collab/join", tok, _join_body(task_id, i)
                    )
                    r2, _ = await _timed(c, "GET", API + "/demo/protected", tok)
                return int(r1.status_code != 200) + int(r2.status_code != 200)

            errors = sum(await asyncio.gather(*(agent(i) for i in range(n))))
            await asyncio.sleep(1.0)
            m = await _metrics(c, ctx.b.admin_key)
            rows.append(row(n, m, errors))
            log(
                f"memory n={n}: rss {m['rss_bytes'] / 1048576:.1f} MiB "
                f"({rows[-1]['rss_change_pct']:+.2f}%), redis keys {m['redis_keys']}, errors {errors}"
            )
    return pd.DataFrame(rows)


# 2. Dynamic join latency -------------------------------------------------


async def _arrivals(
    c: httpx.AsyncClient, ctx: Context, n: int, window: float, task_id: str
) -> list[tuple[float, int]]:
    """n agents arrive at random moments inside `window` seconds and join."""

    async def agent(i: int) -> tuple[float, int]:
        await asyncio.sleep(random.uniform(0, window))
        tok = ctx.tokens[i % len(ctx.tokens)]
        resp, ms = await _timed(
            c, "POST", API + "/collab/join", tok, _join_body(task_id, i)
        )
        return ms, resp.status_code

    return list(await asyncio.gather(*(agent(i) for i in range(n))))


async def bench_join(
    ctx: Context, sizes: list[int], join_rate: float
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Join latency per agent count at one fixed arrival rate (joins per second)."""
    rows: list[dict[str, Any]] = []
    async with _client(URL_B, max(sizes) + 20) as c:
        await _warmup(c, ctx.tokens)
        for n in sizes:
            window = n / join_rate
            task_id = f"bench-join-{uuid.uuid4().hex[:6]}"
            for ms, status in await _arrivals(c, ctx, n, window, task_id):
                rows.append({"agents": n, "latency_ms": ms, "status": status})
            log(f"join n={n}: arrivals over {window:.1f}s at {join_rate:g}/s done")
    raw = pd.DataFrame(rows)
    return raw, summarize_join(raw)


def summarize_join(raw: pd.DataFrame) -> pd.DataFrame:
    ok = raw[raw.status == 200]
    g = ok.groupby("agents")["latency_ms"]
    out = pd.DataFrame(
        {
            "requests": raw.groupby("agents").size(),
            "errors": raw[raw.status != 200].groupby("agents").size(),
            "mean_ms": g.mean(),
            "p50_ms": g.quantile(0.50),
            "p95_ms": g.quantile(0.95),
            "p99_ms": g.quantile(0.99),
            "max_ms": g.max(),
        }
    )
    out["errors"] = out["errors"].fillna(0).astype(int)
    out["p95_under_limit"] = out["p95_ms"] < LIMIT_JOIN_P95_MS
    return out.reset_index()


async def bench_join_sweep(
    ctx: Context, agents: int, rates: list[float]
) -> pd.DataFrame:
    """Same number of agents, increasing arrival rate, to find where latency leaves the limit."""
    rows: list[dict[str, Any]] = []
    async with _client(URL_B, agents + 20) as c:
        await _warmup(c, ctx.tokens)
        for rate in rates:
            window = agents / rate
            task_id = f"bench-sweep-{uuid.uuid4().hex[:6]}"
            results = await _arrivals(c, ctx, agents, window, task_id)
            ok = pd.Series([ms for ms, status in results if status == 200], dtype=float)
            rows.append(
                {
                    "arrival_rate_per_s": rate,
                    "agents": agents,
                    "errors": sum(1 for _, status in results if status != 200),
                    "p50_ms": float(ok.quantile(0.50)) if len(ok) else float("nan"),
                    "p95_ms": float(ok.quantile(0.95)) if len(ok) else float("nan"),
                    "p99_ms": float(ok.quantile(0.99)) if len(ok) else float("nan"),
                    "max_ms": float(ok.max()) if len(ok) else float("nan"),
                }
            )
            log(
                f"join sweep {rate:g}/s: P50 {rows[-1]['p50_ms']:.1f} ms, "
                f"P95 {rows[-1]['p95_ms']:.1f} ms, errors {rows[-1]['errors']}"
            )
    return pd.DataFrame(rows)


# 3. Verification overhead ------------------------------------------------


async def bench_overhead(ctx: Context) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Sequential requests so queueing does not hide the verification cost.

    Overhead is defined as the verification pipeline time (reported by the
    server in each join acknowledgement) divided by the total round trip of
    the protected join request. A plain GET /health gives the no-auth floor.
    """
    rows: list[dict[str, Any]] = []
    steps: list[dict[str, Any]] = []
    tok = ctx.tokens[0]
    async with _client(URL_B, 8) as c:
        for _ in range(50):
            await _timed(
                c, "POST", API + "/collab/join", tok, _join_body("bench-warm", 0)
            )
        task_id = f"bench-ovh-{uuid.uuid4().hex[:6]}"
        for i in range(OVERHEAD_SAMPLES):
            resp, ms = await _timed(
                c, "POST", API + "/collab/join", tok, _join_body(task_id, i)
            )
            if resp.status_code == 200:
                rows.append(
                    {
                        "kind": "join",
                        "round_trip_ms": ms,
                        "verification_ms": float(resp.json()["verification_ms"]),
                    }
                )
        for _ in range(OVERHEAD_SAMPLES):
            resp, ms = await _timed(c, "GET", "/health")
            if resp.status_code == 200:
                rows.append(
                    {"kind": "health", "round_trip_ms": ms, "verification_ms": 0.0}
                )
        for _ in range(OVERHEAD_SAMPLES):
            resp, _ = await _timed(
                c,
                "POST",
                API + "/verify",
                None,
                {"token": tok, "required_action": "task:contribute"},
            )
            if resp.status_code == 200:
                for order, step in enumerate(resp.json()["steps"]):
                    steps.append(
                        {
                            "order": order,
                            "step": step["name"],
                            "duration_ms": step["duration_ms"],
                        }
                    )
    log(f"overhead: {len(rows)} request samples, {len(steps)} step samples")
    return pd.DataFrame(rows), pd.DataFrame(steps)


# 4. Throughput -----------------------------------------------------------


async def bench_throughput(
    ctx: Context, sizes: list[int], per_agent: int, repeats: int
) -> pd.DataFrame:
    """Closed loop: n agents each send `per_agent` protected requests at once."""
    rows: list[dict[str, Any]] = []
    async with _client(URL_B, max(sizes) + 20) as c:
        await _warmup(c, ctx.tokens)
        for n in sizes:
            for rep in range(1, repeats + 1):
                latencies: list[float] = []
                errors = [0]

                async def agent(
                    i: int,
                    latencies: list[float] = latencies,
                    errors: list[int] = errors,
                ) -> None:
                    tok = ctx.tokens[i % len(ctx.tokens)]
                    for _ in range(per_agent):
                        resp, ms = await _timed(c, "GET", API + "/demo/protected", tok)
                        latencies.append(ms)
                        if resp.status_code != 200:
                            errors[0] += 1

                t0 = time.perf_counter()
                await asyncio.gather(*(agent(i) for i in range(n)))
                wall = time.perf_counter() - t0
                ser = pd.Series(latencies)
                rows.append(
                    {
                        "agents": n,
                        "repeat": rep,
                        "requests": len(latencies),
                        "errors": errors[0],
                        "wall_s": wall,
                        "rps": len(latencies) / wall,
                        "p50_ms": float(ser.quantile(0.50)),
                        "p95_ms": float(ser.quantile(0.95)),
                    }
                )
                log(
                    f"throughput n={n} rep={rep}: {rows[-1]['rps']:.0f} req/s, "
                    f"p95 {rows[-1]['p95_ms']:.1f} ms, errors {errors[0]}"
                )
    return pd.DataFrame(rows)


# Evaluation --------------------------------------------------------------


def evaluate(
    mem: pd.DataFrame,
    join_summary: pd.DataFrame,
    join_rate: float,
    sweep: pd.DataFrame,
    overhead: pd.DataFrame,
    throughput: pd.DataFrame,
) -> dict[str, Any]:
    checks: dict[str, Any] = {}

    m = mem[mem.agents > 0]
    worst_mem = float(m.rss_change_pct.abs().max())
    checks["memory_scaling"] = {
        "target": f"RSS within +/-{LIMIT_MEMORY_PCT}% of baseline for all agent counts",
        "worst_abs_change_pct": round(worst_mem, 3),
        "rss_growth_first_to_last_mib": round(
            float(m.rss_mib.iloc[-1] - m.rss_mib.iloc[0]), 3
        ),
        "redis_keys_min_max": [int(m.redis_keys.min()), int(m.redis_keys.max())],
        "pass": worst_mem <= LIMIT_MEMORY_PCT,
    }

    worst_p95 = float(join_summary.p95_ms.max())
    under = sweep[sweep.p95_ms < LIMIT_JOIN_P95_MS].arrival_rate_per_s
    checks["join_latency"] = {
        "target": f"P95 < {LIMIT_JOIN_P95_MS} ms at every agent count (arrival rate "
        f"{join_rate:g} joins/s)",
        "worst_p95_ms": round(worst_p95, 3),
        "join_errors": int(join_summary.errors.sum()),
        "sweep_max_rate_with_p95_under_limit": float(under.max())
        if len(under)
        else None,
        "sweep_p95_ms_by_rate": {
            f"{r:g}": round(float(p), 2)
            for r, p in zip(sweep.arrival_rate_per_s, sweep.p95_ms, strict=True)
        },
        "pass": bool(worst_p95 < LIMIT_JOIN_P95_MS),
    }

    j = overhead[overhead.kind == "join"]
    h = overhead[overhead.kind == "health"]
    share = float(j.verification_ms.sum() / j.round_trip_ms.sum() * 100)
    checks["verification_overhead"] = {
        "target": f"verification time <= {LIMIT_OVERHEAD_PCT}% of a protected request",
        "overhead_pct": round(share, 3),
        "mean_verification_ms": round(float(j.verification_ms.mean()), 4),
        "mean_join_round_trip_ms": round(float(j.round_trip_ms.mean()), 4),
        "mean_health_round_trip_ms": round(float(h.round_trip_ms.mean()), 4),
        "pass": share <= LIMIT_OVERHEAD_PCT,
    }

    med = {
        int(n): float(throughput[throughput.agents == n].rps.median())
        for n in sorted(throughput.agents.unique().tolist())
    }
    rounded = {n: round(r, 2) for n, r in med.items()}
    ref_n = THROUGHPUT_REFERENCE_AGENTS
    if ref_n in med and any(n > ref_n for n in med):
        ref = med[ref_n]
        drops = {
            n: round((ref - r) / ref * 100, 3) for n, r in med.items() if n > ref_n
        }
        worst = max(drops.values())
        checks["throughput"] = {
            "target": f"throughput drop < {LIMIT_THROUGHPUT_DROP_PCT}% beyond {ref_n} agents",
            "reference_rps": round(ref, 2),
            "median_rps_by_agents": rounded,
            "drop_pct_by_agents": drops,
            "worst_drop_pct": worst,
            "errors": int(throughput.errors.sum()),
            "pass": worst < LIMIT_THROUGHPUT_DROP_PCT,
        }
    else:
        checks["throughput"] = {
            "target": f"throughput drop < {LIMIT_THROUGHPUT_DROP_PCT}% beyond {ref_n} agents",
            "median_rps_by_agents": rounded,
            "pass": None,
            "note": "sizes did not include 100 and at least one larger size",
        }
    return checks


def _environment(sizes: list[int], args: dict[str, Any]) -> dict[str, Any]:
    return {
        "timestamp_utc": datetime.now(UTC).isoformat(),
        "python": platform.python_version(),
        "platform": platform.platform(),
        "cpu_count": os.cpu_count(),
        "sizes": sizes,
        "team_count": TEAM_COUNT,
        "baseline_model": {
            "attributes_per_agent_k": BASELINE_ATTRIBUTES,
            "revocation_entries_per_agent_r": BASELINE_REVOCATIONS,
        },
        "llm_tokens_used": 0,
        **args,
    }


async def run_all(
    sizes: list[int],
    join_rate: float,
    per_agent: int,
    repeats: int,
    sweep_agents: int,
    sweep_rates: list[float],
) -> None:
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    ctx = await prepare()
    try:
        started = time.perf_counter()
        log("benchmark 1/4: memory scaling")
        mem = await bench_memory(ctx, sizes)
        log("benchmark 2/4: dynamic join latency")
        join_raw, join_summary = await bench_join(ctx, sizes, join_rate)
        sweep = await bench_join_sweep(ctx, sweep_agents, sweep_rates)
        log("benchmark 3/4: verification overhead")
        overhead, steps = await bench_overhead(ctx)
        log("benchmark 4/4: throughput")
        throughput = await bench_throughput(ctx, sizes, per_agent, repeats)

        mem.to_csv(RESULTS_DIR / "memory_scaling.csv", index=False)
        join_raw.to_csv(RESULTS_DIR / "join_latency_raw.csv", index=False)
        join_summary.to_csv(RESULTS_DIR / "join_latency_summary.csv", index=False)
        sweep.to_csv(RESULTS_DIR / "join_rate_sweep.csv", index=False)
        overhead.to_csv(RESULTS_DIR / "verification_overhead.csv", index=False)
        steps.to_csv(RESULTS_DIR / "verification_steps.csv", index=False)
        throughput.to_csv(RESULTS_DIR / "throughput.csv", index=False)

        checks = evaluate(mem, join_summary, join_rate, sweep, overhead, throughput)
        summary = {
            "environment": _environment(
                sizes,
                {
                    "join_rate_per_s": join_rate,
                    "sweep_agents": sweep_agents,
                    "sweep_rates_per_s": sweep_rates,
                    "per_agent": per_agent,
                    "repeats": repeats,
                },
            ),
            "server_domain_b": ctx.server,
            "token_size_bytes": ctx.token_bytes,
            "token_issue_ms_mean": round(sum(ctx.issue_ms) / len(ctx.issue_ms), 3),
            "total_run_seconds": round(time.perf_counter() - started, 1),
            "checks": checks,
        }
        (RESULTS_DIR / "summary.json").write_text(
            json.dumps(summary, indent=2), encoding="utf-8"
        )

        print("\n=== RESULTS VS PROPOSAL TARGETS ===")
        for name, c in checks.items():
            verdict = {True: "PASS", False: "FAIL", None: "N/A"}[c["pass"]]
            detail = {k: v for k, v in c.items() if k not in ("target", "pass")}
            print(f"{verdict:<5} {name}: {c['target']}\n      {detail}")
        print(f"\nCSV files written to {RESULTS_DIR}")
    finally:
        await ctx.a.aclose()
        await ctx.b.aclose()
