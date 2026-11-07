"""Pure-logic tests for the demo runtime: no servers, no network, no LLM."""

from __future__ import annotations

import asyncio
from types import SimpleNamespace

import pytest

from app.agents import llm
from app.agents.client import Reply
from app.agents.runtime import (
    Control,
    Event,
    Reporter,
    TokenRec,
    apply_live_revokes,
)
from app.agents.scenario import parse_facts


def _reporter() -> tuple[Reporter, list[Event]]:
    seen: list[Event] = []
    return Reporter(seen.append), seen


def test_parse_facts_strips_numbering_and_bullets() -> None:
    text = "1. First useful fact about tokens.\n- Second useful fact about domains.\n\n* Third fact is also long enough.\nshort"
    assert parse_facts(text, 5) == [
        "First useful fact about tokens.",
        "Second useful fact about domains.",
        "Third fact is also long enough.",
    ]


def test_parse_facts_limits_count() -> None:
    text = "\n".join(f"{i}) A sufficiently long fact number {i}" for i in range(1, 9))
    assert len(parse_facts(text, 4)) == 4


def test_reporter_numbers_events_in_order() -> None:
    rep, seen = _reporter()
    rep.emit("a", "info", "one")
    rep.stage("researcher", "domain-a", "joined")
    assert [e.seq for e in seen] == [0, 1]
    assert seen[1].kind == "stage"
    assert seen[1].data == {
        "role": "researcher",
        "domain": "domain-a",
        "stage": "joined",
    }


def test_verdict_reports_rejection_details() -> None:
    rep, seen = _reporter()
    body = {
        "error": {
            "code": "TOKEN_REVOKED",
            "details": {
                "verification": {
                    "steps": [
                        {"name": "signature", "passed": True},
                        {"name": "revocation", "passed": False},
                    ]
                }
            },
        }
    }
    assert rep.verdict("r@a", "domain-b", "fact", Reply(401, body, 3.0)) is False
    assert seen[0].data["code"] == "TOKEN_REVOKED"
    assert seen[0].data["failed_steps"] == ["revocation"]


def test_control_rejects_unknown_mode() -> None:
    with pytest.raises(ValueError):
        Control("turbo")


def test_fast_mode_never_waits() -> None:
    rep, seen = _reporter()
    asyncio.run(asyncio.wait_for(Control("fast").beat(rep, "x"), 1))
    assert seen == []


def test_step_mode_waits_until_next() -> None:
    async def scenario() -> list[str]:
        rep, seen = _reporter()
        ctl = Control("step")
        task = asyncio.create_task(ctl.beat(rep, "send fact"))
        await asyncio.sleep(0.05)
        assert not task.done()
        assert ctl.waiting == "send fact"
        ctl.next()
        await asyncio.wait_for(task, 1)
        assert ctl.waiting is None
        return [e.kind for e in seen]

    assert asyncio.run(scenario()) == ["wait"]


def test_switching_to_fast_releases_a_waiting_step() -> None:
    async def scenario() -> None:
        rep, _ = _reporter()
        ctl = Control("step")
        task = asyncio.create_task(ctl.beat(rep, "x"))
        await asyncio.sleep(0.05)
        ctl.set_mode("fast")
        await asyncio.wait_for(task, 1)

    asyncio.run(scenario())


class _FakeDomain:
    def __init__(self) -> None:
        self.revoked: list[tuple[str, str]] = []

    async def revoke(self, jti: str, reason: str) -> Reply:
        self.revoked.append((jti, reason))
        return Reply(200, {"propagation": [{"peer": "domain-b"}]}, 1.0)


def test_live_revoke_hits_the_issuing_domain_once() -> None:
    async def scenario() -> tuple[list[str], list[str], _FakeDomain]:
        rep, seen = _reporter()
        domain = _FakeDomain()
        tokens = {"analyst": TokenRec("analyst", "domain-b", "jti-1", "tok")}
        ctl = Control("fast")
        ctl.request_revoke("analyst")
        ctl.request_revoke("analyst")  # a double click must not revoke twice
        first = await apply_live_revokes(rep, ctl, tokens, {"domain-b": domain})
        ctl.request_revoke("analyst")
        second = await apply_live_revokes(rep, ctl, tokens, {"domain-b": domain})
        assert second == []
        return first, [e.kind for e in seen], domain

    first, kinds, domain = asyncio.run(scenario())
    assert first == ["analyst"]
    assert kinds == ["revoke", "stage"]
    assert len(domain.revoked) == 1


def test_revoke_for_an_agent_without_a_token_is_reported_not_raised() -> None:
    async def scenario() -> list[str]:
        rep, seen = _reporter()
        ctl = Control("fast")
        ctl.request_revoke("reviewer")
        await apply_live_revokes(rep, ctl, {}, {})
        return [e.kind for e in seen]

    assert asyncio.run(scenario()) == ["info"]


def test_complete_sync_without_key_raises_llm_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        llm, "load_settings", lambda: SimpleNamespace(api_key=None, model="m")
    )
    with pytest.raises(llm.LlmError):
        llm.complete_sync("s", "u")
