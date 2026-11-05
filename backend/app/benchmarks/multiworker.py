"""Throughput experiment against a multi-worker Domain B.

Start Domain B with `--workers N`, then run this from the backend folder:

    python -m app.benchmarks.multiworker --workers N [--join-sweep]

The committed harness is reused unchanged. Results go to
benchmarks/results/<tag> (default tag: workers-<N>), so the single-worker
results stay untouched. Only throughput (and, with --join-sweep, the join rate
sweep) is measured: /metrics/process reports one worker process only, so the
memory benchmark remains a single-worker test.

    python -m app.benchmarks.multiworker --compare

draws benchmarks/charts/07_throughput_comparison.png from every result folder
that holds a throughput.csv, without needing any server.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import platform
import time
from collections import Counter
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import httpx
import matplotlib.pyplot as plt
import pandas as pd

from app.benchmarks import harness

PALETTE = ["#0072B2", "#6B7280", "#D55E00", "#009E73", "#CC79A7"]
CENSUS_PROBES = 200


async def _census(admin_key: str) -> dict[str, Any]:
    """Count the distinct server processes answering on Domain B's port.

    Every probe opens a fresh connection, so with several uvicorn workers the
    pids seen show how new connections are spread across them. The count is a
    lower bound: a worker that never accepted a probe is not seen.
    """
    pids: Counter[int] = Counter()
    sem = asyncio.Semaphore(20)

    async def probe() -> None:
        async with sem, httpx.AsyncClient(base_url=harness.URL_B, timeout=10.0) as c:
            try:
                resp = await c.get(
                    harness.API + "/metrics/process",
                    headers={"X-Admin-Key": admin_key, "Connection": "close"},
                )
            except httpx.TransportError:
                return
            if resp.status_code == 200:
                pids[int(resp.json()["pid"])] += 1

    await asyncio.gather(*(probe() for _ in range(CENSUS_PROBES)))
    return {
        "workers_seen": len(pids),
        "worker_share": {str(pid): n for pid, n in sorted(pids.items())},
    }


def _medians(df: pd.DataFrame) -> dict[int, float]:
    return {
        int(n): float(df[df.agents == n].rps.median())
        for n in sorted(df.agents.unique().tolist())
    }


def _check(df: pd.DataFrame) -> dict[str, Any]:
    ref_n = harness.THROUGHPUT_REFERENCE_AGENTS
    limit = harness.LIMIT_THROUGHPUT_DROP_PCT
    target = f"throughput drop < {limit}% beyond {ref_n} agents"
    med = _medians(df)
    rounded = {n: round(r, 2) for n, r in med.items()}
    if ref_n in med and any(n > ref_n for n in med):
        ref = med[ref_n]
        drops = {
            n: round((ref - r) / ref * 100, 3) for n, r in med.items() if n > ref_n
        }
        worst = max(drops.values())
        return {
            "target": target,
            "reference_rps": round(ref, 2),
            "median_rps_by_agents": rounded,
            "drop_pct_by_agents": drops,
            "worst_drop_pct": worst,
            "errors": int(df.errors.sum()),
            "pass": worst < limit,
        }
    return {
        "target": target,
        "median_rps_by_agents": rounded,
        "errors": int(df.errors.sum()),
        "pass": None,
        "note": f"sizes did not include {ref_n} and at least one larger size",
    }


async def run(args: argparse.Namespace) -> None:
    tag = args.tag or f"workers-{args.workers}"
    harness.set_output_tag(tag)
    out = harness.RESULTS_DIR
    out.mkdir(parents=True, exist_ok=True)

    ctx = await harness.prepare()
    try:
        census = await _census(ctx.b.admin_key)
        seen = census["workers_seen"]
        audit = ctx.server.get("audit_verifications")
        harness.log(
            f"{args.workers} worker(s) requested, {seen} server process(es) seen, "
            f"audit_verifications={audit}"
        )
        if seen < args.workers:
            harness.log(
                f"WARNING: saw {seen} of {args.workers} requested worker(s). Check how "
                "Domain B was started; connections may also be spread unevenly."
            )

        started = time.perf_counter()
        throughput = await harness.bench_throughput(
            ctx, args.sizes, args.per_agent, args.repeats
        )
        throughput.to_csv(out / "throughput.csv", index=False)
        check = _check(throughput)

        sweep_p95: dict[str, float] = {}
        if args.join_sweep:
            sweep = await harness.bench_join_sweep(
                ctx, harness.DEFAULT_SWEEP_AGENTS, list(harness.DEFAULT_SWEEP_RATES)
            )
            sweep.to_csv(out / "join_rate_sweep.csv", index=False)
            sweep_p95 = {
                f"{r:g}": round(float(p), 2)
                for r, p in zip(sweep.arrival_rate_per_s, sweep.p95_ms, strict=True)
            }

        summary = {
            "environment": {
                "timestamp_utc": datetime.now(UTC).isoformat(),
                "python": platform.python_version(),
                "platform": platform.platform(),
                "cpu_count": os.cpu_count(),
                "sizes": args.sizes,
                "per_agent": args.per_agent,
                "repeats": args.repeats,
            },
            "server_domain_b": {
                **ctx.server,
                **census,
                "workers_requested": args.workers,
            },
            "total_run_seconds": round(time.perf_counter() - started, 1),
            "join_sweep_p95_ms_by_rate": sweep_p95,
            "checks": {"throughput": check},
        }
        (out / "summary.json").write_text(
            json.dumps(summary, indent=2), encoding="utf-8"
        )
    finally:
        await ctx.a.aclose()
        await ctx.b.aclose()

    verdict = {True: "PASS", False: "FAIL", None: "N/A"}[check["pass"]]
    detail = {k: v for k, v in check.items() if k not in ("target", "pass")}
    print("\n=== THROUGHPUT VS PROPOSAL TARGET ===")
    print(f"{verdict:<5} throughput: {check['target']}\n      {detail}")
    if sweep_p95:
        print(f"      join sweep P95 ms by arrival rate: {sweep_p95}")
    print(f"\nCSV files written to {out}")


def _discover() -> list[Path]:
    base = harness.REPO_ROOT / "benchmarks" / "results"
    folders = [base] if (base / "throughput.csv").exists() else []
    folders += sorted(
        p
        for p in base.iterdir()
        if p.is_dir() and p.name != "quick" and (p / "throughput.csv").exists()
    )
    return folders


def _label(folder: Path) -> str:
    server: dict[str, Any] = {}
    summary = folder / "summary.json"
    if summary.exists():
        server = json.loads(summary.read_text(encoding="utf-8")).get(
            "server_domain_b", {}
        )
    workers = int(server.get("workers_requested") or 1)
    audit = "on" if server.get("audit_verifications", True) else "off"
    noun = "worker" if workers == 1 else "workers"
    name = "main run" if folder.name == "results" else folder.name
    return f"{workers} {noun}, audit {audit} ({name})"


def make_comparison() -> Path | None:
    folders = _discover()
    if len(folders) < 2:
        harness.log(
            "comparison skipped: need at least two result folders with throughput.csv"
        )
        return None

    plt.switch_backend("Agg")
    fig, (left, right) = plt.subplots(1, 2, figsize=(12, 4.8))
    ref_n = harness.THROUGHPUT_REFERENCE_AGENTS
    floor = 100 - harness.LIMIT_THROUGHPUT_DROP_PCT
    for i, folder in enumerate(folders):
        df = pd.read_csv(folder / "throughput.csv")
        stats = df.groupby("agents").rps.agg(["median", "min", "max"]).reset_index()
        color = PALETTE[i % len(PALETTE)]
        label = _label(folder)
        err = [stats["median"] - stats["min"], stats["max"] - stats["median"]]
        left.errorbar(
            stats["agents"],
            stats["median"],
            yerr=err,
            label=label,
            color=color,
            marker="o",
            capsize=3,
            linewidth=1.8,
        )
        med = _medians(df)
        if ref_n in med:
            right.plot(
                list(med),
                [v / med[ref_n] * 100 for v in med.values()],
                label=label,
                color=color,
                marker="o",
                linewidth=1.8,
            )

    right.axhline(
        floor,
        color="#111111",
        linestyle="--",
        linewidth=1,
        label=f"target floor ({floor:g}% of the {ref_n}-agent rate)",
    )
    left.set_ylabel("Requests per second (median, bars: min to max)")
    left.set_title("Throughput of the verification gate")
    right.set_ylabel(f"% of the run's own throughput at {ref_n} agents")
    right.set_title("Degradation as agents are added")
    for ax in (left, right):
        ax.axvline(ref_n, color="#999999", linestyle=":", linewidth=1)
        ax.set_xlabel("Concurrent agents")
        ax.set_ylim(bottom=0)
        ax.grid(axis="y", alpha=0.3)
        ax.spines["top"].set_visible(False)
        ax.spines["right"].set_visible(False)
        ax.legend(frameon=False, fontsize=8)
    fig.tight_layout()

    out_dir = harness.REPO_ROOT / "benchmarks" / "charts"
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / "07_throughput_comparison.png"
    fig.savefig(path, dpi=200)
    plt.close(fig)
    harness.log(f"chart written: {path}")
    return path


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Throughput benchmark for a multi-worker Domain B"
    )
    parser.add_argument(
        "--workers", type=int, help="uvicorn workers Domain B was started with"
    )
    parser.add_argument(
        "--tag", default="", help="output sub folder (default: workers-<N>)"
    )
    parser.add_argument(
        "--sizes", type=int, nargs="+", default=list(harness.DEFAULT_SIZES)
    )
    parser.add_argument("--per-agent", type=int, default=15)
    parser.add_argument("--repeats", type=int, default=3)
    parser.add_argument(
        "--join-sweep", action="store_true", help="also run the join rate sweep"
    )
    parser.add_argument(
        "--compare",
        action="store_true",
        help="only redraw the comparison chart, no servers needed",
    )
    args = parser.parse_args()

    if args.compare:
        make_comparison()
        return
    if not args.workers:
        parser.error("--workers is required unless --compare is used")
    args.sizes = sorted(args.sizes)
    asyncio.run(run(args))
    make_comparison()


if __name__ == "__main__":
    main()
