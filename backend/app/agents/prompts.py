"""Prompt templates for the agents. Kept apart from the code that sends them."""

from __future__ import annotations

FACTS_SYSTEM = (
    "You are a careful research assistant on a university security project. "
    "Reply with plain text only."
)

SUMMARY_SYSTEM = (
    "You write for a university jury. Use only the research notes you are given "
    "and never add facts that are not in them."
)

REVIEW_SYSTEM = (
    "You are a strict reviewer. You check that a summary uses only the research "
    "notes and contains no invented facts."
)


def facts_user(topic: str, focus: str, n: int) -> str:
    return (
        f"Topic: {topic}\nFocus: {focus}\n"
        f"Write exactly {n} distinct factual statements, one per line, each under "
        "28 words. No numbering, no bullets, no preface."
    )


def summary_user(topic: str, facts: list[str]) -> str:
    notes = "\n".join(f"- {f}" for f in facts)
    return (
        f"Topic: {topic}\nResearch notes:\n{notes}\n"
        "Write one paragraph of at most 90 words that summarises only these notes."
    )


def review_user(topic: str, facts: list[str], summary: str) -> str:
    notes = "\n".join(f"- {f}" for f in facts)
    return (
        f"Topic: {topic}\nResearch notes:\n{notes}\n\nSummary to review:\n{summary}\n\n"
        "Reply on one line: APPROVE or REVISE, then a colon, then one sentence of at "
        "most 30 words explaining why."
    )


ANALYSIS_SYSTEM = (
    "You are a data analyst on a university security project. Use only the "
    "research notes you are given and never add facts that are not in them."
)


def analysis_user(topic: str, facts: list[str]) -> str:
    notes = "\n".join(f"- {f}" for f in facts)
    return (
        f"Topic: {topic}\nResearch notes:\n{notes}\n"
        "In at most 45 words, state the single most important pattern across "
        "these notes and one risk it addresses."
    )
