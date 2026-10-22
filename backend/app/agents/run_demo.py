"""Cross-domain demo. Run from the backend folder:
python -m app.agents.run_demo --scenario normal
python -m app.agents.run_demo --scenario revoke --revoke-after 1
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
import time
import uuid

from dotenv import dotenv_values

from app.agents.client import ENV_DIR, DomainClient, Reply
from app.agents.researcher import TOPIC, ResearcherAgent
from app.agents.writer import WriterAgent

URL_A = os.environ.get("DOMAIN_A_URL", "http://127.0.0.1:9001")
URL_B = os.environ.get("DOMAIN_B_URL", "http://127.0.0.1:9002")
ACTIONS = ["task:contribute"]
T0 = time.perf_counter()


def log(actor: str, msg: str) -> None:
    print(f"[{time.perf_counter() - T0:6.2f}s] {actor:<24} {msg}", flush=True)


def verdict(actor: str, what: str, r: Reply) -> bool:
    if r.ok:
        b = r.body
        log(
            actor,
            f"{what}: ACCEPTED by {b['verified_by']} (issuer {b['issuer']}, "
            f"verify {b['verification_ms']:.2f} ms, round trip {r.elapsed_ms:.0f} ms)",
        )
        return True
    err = r.body.get("error", {})
    ver = (err.get("details") or {}).get("verification") or {}
    failed = [s["name"] for s in ver.get("steps", []) if not s.get("passed")]
    log(
        actor,
        f"{what}: REJECTED HTTP {r.status} {err.get('code')} "
        f"(failed step: {', '.join(failed) or 'n/a'})",
    )
    return False


async def run(scenario: str, revoke_after: int) -> int:
    groq_key = os.environ.get("GROQ_API_KEY") or dotenv_values(
        ENV_DIR / "agents.env"
    ).get("GROQ_API_KEY")
    a = DomainClient("domain-a", URL_A, ENV_DIR / "domain-a.env")
    b = DomainClient("domain-b", URL_B, ENV_DIR / "domain-b.env")
    researcher, writer = ResearcherAgent(), WriterAgent()
    try:
        if not (await a.health() and await b.health()):
            print("Both backends must be running (ports 9001 and 9002).")
            return 2

        sfx = uuid.uuid4().hex[:6]
        task_id = f"task-{sfx}"
        log("orchestrator", f"scenario={scenario} task={task_id} topic='{TOPIC}'")

        # Each domain issues a token for its own agent, valid for the OTHER domain.
        r_team = await a.create_team(f"researcher-team-{sfx}")
        w_team = await b.create_team(f"writer-team-{sfx}")
        r_tok = await a.issue_token(r_team, "researcher", ACTIONS, ["domain-b"])
        w_tok = await b.issue_token(w_team, "writer", ACTIONS, ["domain-a"])
        log(
            "domain-a",
            f"issued researcher token jti={r_tok['jti']} aud={r_tok['audience']}",
        )
        log(
            "domain-b",
            f"issued writer token     jti={w_tok['jti']} aud={w_tok['audience']}",
        )

        # Join: each agent proves itself to the other domain.
        ok1 = verdict(
            "researcher@domain-a",
            "join domain-b",
            await b.join(
                r_tok["token"], task_id, researcher.name, researcher.task_role
            ),
        )
        ok2 = verdict(
            "writer@domain-b",
            "join domain-a",
            await a.join(w_tok["token"], task_id, writer.name, writer.task_role),
        )
        if not (ok1 and ok2):
            return 1

        # Researcher streams facts to Domain B; each one re-verifies its token.
        facts = researcher.research()
        aborted = False
        for i, fact in enumerate(facts):
            if scenario == "revoke" and i == revoke_after:
                rev = await a.revoke(
                    r_tok["jti"], "demo: researcher compromised mid-task"
                )
                log(
                    "domain-a (admin)",
                    f"REVOKED researcher token, HTTP {rev.status}, "
                    f"propagation={json.dumps(rev.body.get('propagation'))}",
                )
            if not verdict(
                "researcher@domain-a",
                f"fact {i + 1}/{len(facts)} -> domain-b",
                await b.contribute(
                    r_tok["token"], task_id, researcher.name, "fact", fact
                ),
            ):
                aborted = True
                break

        if aborted:
            kept = await b.contributions(task_id)
            log(
                "orchestrator",
                f"TASK ABORTED. Domain B holds {len(kept)} of {len(facts)} facts; "
                "writer does not start on incomplete research.",
            )
            return 0 if scenario == "revoke" else 1

        # Writer reads the facts from its own domain and answers back to Domain A.
        stored = [
            c["content"] for c in await b.contributions(task_id) if c["kind"] == "fact"
        ]
        text, mode = writer.write(TOPIC, stored, groq_key)
        log("writer@domain-b", f"summary written via {mode}")
        verdict(
            "writer@domain-b",
            "summary -> domain-a",
            await a.contribute(w_tok["token"], task_id, writer.name, "summary", text),
        )
        print("\n--- FINAL SUMMARY ---\n" + text + "\n")
        log("orchestrator", f"TASK COMPLETED in {time.perf_counter() - T0:.2f}s")
        return 0 if scenario == "normal" else 1
    finally:
        await a.aclose()
        await b.aclose()


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--scenario", choices=["normal", "revoke"], default="normal")
    p.add_argument(
        "--revoke-after",
        type=int,
        default=1,
        help="revoke the researcher token before fact N (0-based)",
    )
    args = p.parse_args()
    sys.exit(asyncio.run(run(args.scenario, args.revoke_after)))


if __name__ == "__main__":
    main()
