"""Cross-domain demo. Run from the backend folder:
python -m app.agents.run_demo --scenario normal
python -m app.agents.run_demo --scenario revoke --revoke-after 1
python -m app.agents.run_demo --scenario scope
python -m app.agents.run_demo --scenario expired
python -m app.agents.run_demo --scenario team --pace-ms 1500
"""

from __future__ import annotations

import argparse
import asyncio
import sys

from app.agents.scenario import SCENARIOS, Control, Event, execute


def print_event(ev: Event) -> None:
    if ev.kind == "summary":
        print("\n--- FINAL SUMMARY ---\n" + ev.data["text"] + "\n", flush=True)
        return
    if ev.kind == "stage":
        return  # stage changes are for the dashboard; the log has the verdicts
    print(f"[{ev.t:6.2f}s] {ev.actor:<24} {ev.message}", flush=True)


async def run(scenario: str, revoke_after: int, pace_ms: int, topic: str | None) -> int:
    ctl = Control("slow" if pace_ms > 0 else "fast", pace_s=pace_ms / 1000)
    outcome = await execute(
        scenario, revoke_after, print_event, topic=topic, control=ctl
    )
    return outcome.exit_code


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--scenario", choices=SCENARIOS, default="normal")
    p.add_argument(
        "--revoke-after",
        type=int,
        default=1,
        help="revoke the researcher token before fact N (0-based)",
    )
    p.add_argument("--pace-ms", type=int, default=0, help="pause between steps")
    p.add_argument("--topic", default=None, help="what the agents research")
    args = p.parse_args()
    sys.exit(
        asyncio.run(run(args.scenario, args.revoke_after, args.pace_ms, args.topic))
    )


if __name__ == "__main__":
    main()
