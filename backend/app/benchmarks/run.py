"""Run the benchmarks from the backend folder:

python -m app.benchmarks.run            full run (sizes 10 50 100 250 500)
python -m app.benchmarks.run --quick    dry run (sizes 10 50 100, 1 repeat)
python -m app.benchmarks.run --charts-only
python -m app.benchmarks.run --tag audit-off   keep results in a sub folder
"""

from __future__ import annotations

import argparse
import asyncio

from app.benchmarks import charts, harness


def main() -> None:
    p = argparse.ArgumentParser(description="Authorization layer benchmarks")
    p.add_argument(
        "--quick", action="store_true", help="sizes 10 50 100 and one repeat"
    )
    p.add_argument("--sizes", type=int, nargs="+", help="agent counts to test")
    p.add_argument(
        "--join-rate",
        type=float,
        default=harness.DEFAULT_JOIN_RATE,
        help="agent arrivals per second for the per-size join test",
    )
    p.add_argument(
        "--sweep-agents",
        type=int,
        default=None,
        help="agents per run in the arrival-rate sweep",
    )
    p.add_argument(
        "--sweep-rates",
        type=float,
        nargs="+",
        default=harness.DEFAULT_SWEEP_RATES,
        help="arrival rates (joins per second) for the sweep",
    )
    p.add_argument(
        "--per-agent", type=int, default=15, help="throughput requests per agent"
    )
    p.add_argument("--repeats", type=int, default=3, help="throughput repeats per size")
    p.add_argument(
        "--tag", default="", help="write to benchmarks/results/<tag> and charts/<tag>"
    )
    p.add_argument(
        "--charts-only", action="store_true", help="redraw charts from existing CSVs"
    )
    args = p.parse_args()

    harness.set_output_tag(args.tag)
    sizes = args.sizes or ([10, 50, 100] if args.quick else harness.DEFAULT_SIZES)
    repeats = 1 if args.quick else args.repeats
    sweep_agents = args.sweep_agents or (
        50 if args.quick else harness.DEFAULT_SWEEP_AGENTS
    )
    if not args.charts_only:
        asyncio.run(
            harness.run_all(
                sorted(sizes),
                args.join_rate,
                args.per_agent,
                repeats,
                sweep_agents,
                sorted(args.sweep_rates),
            )
        )
    charts.make_all()


if __name__ == "__main__":
    main()
