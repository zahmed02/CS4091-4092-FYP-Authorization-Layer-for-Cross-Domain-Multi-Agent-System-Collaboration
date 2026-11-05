"""Draw the benchmark charts from the CSV files written by the harness."""

from __future__ import annotations

from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from matplotlib.axes import Axes
from matplotlib.figure import Figure

from app.benchmarks import harness
from app.benchmarks.harness import (
    BASELINE_ATTRIBUTES,
    BASELINE_REVOCATIONS,
    LIMIT_JOIN_P95_MS,
    LIMIT_MEMORY_PCT,
    LIMIT_OVERHEAD_PCT,
    LIMIT_THROUGHPUT_DROP_PCT,
    THROUGHPUT_REFERENCE_AGENTS,
)

OURS = "#0072B2"
BASE = "#D55E00"
GREY = "#6b7280"
LIGHT = "#9ca3af"
GOOD = "#009E73"


def _style(ax: Axes) -> None:
    ax.spines[["top", "right"]].set_visible(False)
    ax.grid(axis="y", alpha=0.25)
    ax.set_axisbelow(True)


def _save(fig: Figure, name: str) -> Path:
    harness.CHARTS_DIR.mkdir(parents=True, exist_ok=True)
    path = harness.CHARTS_DIR / name
    fig.tight_layout()
    fig.savefig(path, dpi=200)
    plt.close(fig)
    return path


def chart_memory(mem: pd.DataFrame) -> Path:
    m = mem[mem.agents > 0]
    worst = float(m.rss_change_pct.abs().max())
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(11, 4.4))
    ax1.axhspan(
        -LIMIT_MEMORY_PCT,
        LIMIT_MEMORY_PCT,
        color=OURS,
        alpha=0.10,
        label=f"target band (+/-{LIMIT_MEMORY_PCT:g}%)",
    )
    ax1.plot(
        m.agents, m.rss_change_pct, marker="o", color=OURS, label="Domain B server RSS"
    )
    lim = max(LIMIT_MEMORY_PCT * 1.3, worst * 1.3)
    ax1.set_ylim(-lim, lim)
    ax1.set_xlabel("Agents presenting tokens")
    ax1.set_ylabel("Memory change vs start (%)")
    ax1.set_title(f"Server memory vs agents (worst change {worst:.2f}%)", fontsize=10)
    ax1.legend(frameon=False, fontsize=8)
    _style(ax1)

    ax2.plot(m.agents, m.redis_keys, marker="o", color=OURS)
    ax2.set_ylim(0, max(float(m.redis_keys.max()) * 1.5, 5))
    ax2.set_xlabel("Agents presenting tokens")
    ax2.set_ylabel("Keys stored in Domain B Redis")
    ax2.set_title("Stored state does not grow with agents", fontsize=10)
    _style(ax2)
    return _save(fig, "01_memory_scaling.png")


def chart_complexity(mem: pd.DataFrame) -> Path:
    x = mem.agents.to_numpy(dtype=float)
    base_mb = mem.baseline_model_bytes.to_numpy(dtype=float) / 1e6
    ours_mb = mem.rss_delta_bytes.to_numpy(dtype=float) / 1e6
    slope = float((x * base_mb).sum() / (x * x).sum()) if (x * x).sum() else 0.0
    xs = np.linspace(0, x.max(), 100)

    fig, ax = plt.subplots(figsize=(7.5, 4.6))
    ax.plot(x, base_mb, "s", color=BASE, label="Per-agent registry model (measured)")
    ax.plot(xs, slope * xs, "--", color=BASE, alpha=0.8, label="O(r*n*k) fit")
    ax.plot(x, ours_mb, "o", color=OURS, label="Our server RSS change (measured)")
    ax.axhline(0, color=OURS, alpha=0.7, label="O(t+m): constant in n")
    ax.set_xlabel("Agents (n)")
    ax.set_ylabel("Memory growth (MB)")
    ax.set_title(
        f"Memory growth: measured vs theory (model: k={BASELINE_ATTRIBUTES} attributes, "
        f"r={BASELINE_REVOCATIONS} revocations per agent)",
        fontsize=9,
    )
    ax.legend(frameon=False, fontsize=8)
    _style(ax)
    return _save(fig, "02_complexity_overlay.png")


def chart_join(summary: pd.DataFrame) -> Path:
    fig, ax = plt.subplots(figsize=(7.5, 4.6))
    ax.plot(summary.agents, summary.p50_ms, marker="o", color=GOOD, label="P50")
    ax.plot(summary.agents, summary.p95_ms, marker="o", color=OURS, label="P95")
    ax.plot(summary.agents, summary.p99_ms, marker="o", color=GREY, label="P99")
    ax.axhline(
        LIMIT_JOIN_P95_MS,
        color=BASE,
        linestyle="--",
        label=f"P95 target ({LIMIT_JOIN_P95_MS:g} ms)",
    )
    ax.set_ylim(0, max(LIMIT_JOIN_P95_MS * 1.2, float(summary.p99_ms.max()) * 1.15))
    ax.set_xlabel("Agents joining dynamically")
    ax.set_ylabel("Join latency (ms)")
    ax.set_title(
        f"Dynamic join latency (worst P95 {summary.p95_ms.max():.1f} ms)", fontsize=10
    )
    ax.legend(frameon=False, fontsize=8)
    _style(ax)
    return _save(fig, "03_join_latency.png")


def chart_join_sweep(sweep: pd.DataFrame) -> Path:
    agents = int(sweep.agents.iloc[0])
    fig, ax = plt.subplots(figsize=(7.5, 4.6))
    ax.plot(sweep.arrival_rate_per_s, sweep.p50_ms, marker="o", color=GOOD, label="P50")
    ax.plot(sweep.arrival_rate_per_s, sweep.p95_ms, marker="o", color=OURS, label="P95")
    ax.axhline(
        LIMIT_JOIN_P95_MS,
        color=BASE,
        linestyle="--",
        label=f"P95 target ({LIMIT_JOIN_P95_MS:g} ms)",
    )
    ax.set_xscale("log")
    ax.set_xticks(sweep.arrival_rate_per_s)
    ax.set_xticklabels([f"{r:g}" for r in sweep.arrival_rate_per_s])
    ax.set_yscale("log")
    ax.set_xlabel("Agent arrival rate (joins per second)")
    ax.set_ylabel("Join latency (ms, log scale)")
    ax.set_title(f"Join latency vs arrival rate ({agents} agents per run)", fontsize=10)
    ax.legend(frameon=False, fontsize=8)
    _style(ax)
    return _save(fig, "06_join_rate_sweep.png")


def chart_overhead(overhead: pd.DataFrame, steps: pd.DataFrame) -> Path:
    j = overhead[overhead.kind == "join"]
    h = overhead[overhead.kind == "health"]
    ver = float(j.verification_ms.mean())
    rest = float(j.round_trip_ms.mean()) - ver
    share = float(j.verification_ms.sum() / j.round_trip_ms.sum() * 100)

    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(11, 4.4))
    labels = ["GET /health\n(no authorization)", "POST /collab/join\n(verified)"]
    ax1.bar(
        labels,
        [float(h.round_trip_ms.mean()), rest],
        color=LIGHT,
        label="Request handling",
    )
    ax1.bar(labels[1:], [ver], bottom=[rest], color=OURS, label="Token verification")
    ax1.set_ylabel("Mean time per request (ms)")
    ax1.set_title(
        f"Verification is {share:.1f}% of a protected request "
        f"(limit {LIMIT_OVERHEAD_PCT:g}%)",
        fontsize=10,
    )
    ax1.legend(frameon=False, fontsize=8)
    _style(ax1)

    order = steps.groupby("step")["order"].min().sort_values().index.tolist()
    means = steps.groupby("step")["duration_ms"].mean().reindex(order)
    ax2.barh(order[::-1], means.to_numpy()[::-1], color=OURS)
    ax2.set_xlabel("Mean time (ms)")
    ax2.set_title("Where verification time goes (7-step pipeline)", fontsize=10)
    ax2.grid(axis="x", alpha=0.25)
    ax2.spines[["top", "right"]].set_visible(False)
    return _save(fig, "04_verification_overhead.png")


def chart_throughput(thr: pd.DataFrame) -> Path:
    g = thr.groupby("agents").agg(
        rps=("rps", "median"),
        lo=("rps", "min"),
        hi=("rps", "max"),
        p95=("p95_ms", "median"),
    )
    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(11, 4.4))
    ax1.errorbar(
        g.index,
        g.rps,
        yerr=[g.rps - g.lo, g.hi - g.rps],
        marker="o",
        color=OURS,
        capsize=3,
        label="Median (bars: min to max)",
    )
    ax1.axvline(THROUGHPUT_REFERENCE_AGENTS, color=LIGHT, linestyle=":")
    if THROUGHPUT_REFERENCE_AGENTS in g.index:
        floor = float(g.rps[THROUGHPUT_REFERENCE_AGENTS]) * (
            1 - LIMIT_THROUGHPUT_DROP_PCT / 100
        )
        ax1.axhline(
            floor,
            color=BASE,
            linestyle="--",
            label=f"{100 - LIMIT_THROUGHPUT_DROP_PCT:g}% of throughput at "
            f"{THROUGHPUT_REFERENCE_AGENTS} agents",
        )
    ax1.set_ylim(0, float(g.hi.max()) * 1.2)
    ax1.set_xlabel("Concurrent agents")
    ax1.set_ylabel("Requests per second")
    ax1.set_title("Throughput of the verification gate", fontsize=10)
    ax1.legend(frameon=False, fontsize=8)
    _style(ax1)

    ax2.plot(g.index, g.p95, marker="o", color=GREY)
    ax2.set_xlabel("Concurrent agents")
    ax2.set_ylabel("P95 request latency (ms)")
    ax2.set_title("Latency under load", fontsize=10)
    _style(ax2)
    return _save(fig, "05_throughput.png")


def make_all() -> list[Path]:
    r = harness.RESULTS_DIR
    paths = [
        chart_memory(pd.read_csv(r / "memory_scaling.csv")),
        chart_complexity(pd.read_csv(r / "memory_scaling.csv")),
        chart_join(pd.read_csv(r / "join_latency_summary.csv")),
        chart_overhead(
            pd.read_csv(r / "verification_overhead.csv"),
            pd.read_csv(r / "verification_steps.csv"),
        ),
        chart_throughput(pd.read_csv(r / "throughput.csv")),
    ]
    if (r / "join_rate_sweep.csv").exists():
        paths.append(chart_join_sweep(pd.read_csv(r / "join_rate_sweep.csv")))
    for p in paths:
        print(f"[bench] chart written: {p}")
    return paths
