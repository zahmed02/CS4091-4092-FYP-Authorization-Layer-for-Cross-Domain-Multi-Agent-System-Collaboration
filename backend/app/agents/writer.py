"""Domain B agent. Template summary by default; real CrewAI agent when a Groq
key is configured. Any LLM failure falls back to the template."""

from __future__ import annotations

import os

GROQ_MODEL = "groq/llama-3.3-70b-versatile"


def _template(topic: str, facts: list[str]) -> str:
    body = " ".join(f"({i}) {f}" for i, f in enumerate(facts, 1))
    return f"Summary on {topic}: {body}"


def _crew_summary(topic: str, facts: list[str], api_key: str) -> str:
    os.environ.setdefault("CREWAI_DISABLE_TELEMETRY", "true")
    os.environ.setdefault("OTEL_SDK_DISABLED", "true")
    from crewai import LLM, Agent, Crew, Task  # imported lazily: slow import

    llm = LLM(model=GROQ_MODEL, api_key=api_key, temperature=0.2)
    writer = Agent(
        role="Technical writer",
        goal="Turn verified research facts into a short, accurate summary",
        backstory="You write for a university jury. You never add facts "
        "that are not in the research notes.",
        llm=llm,
        allow_delegation=False,
        verbose=False,
    )
    task = Task(
        description=f"Topic: {topic}\nResearch notes:\n"
        + "\n".join(f"- {f}" for f in facts)
        + "\nWrite one paragraph summarising only these notes.",
        expected_output="One paragraph, at most 90 words.",
        agent=writer,
    )
    result = Crew(agents=[writer], tasks=[task], verbose=False).kickoff()
    return str(result.raw).strip()


class WriterAgent:
    name = "writer-agent"
    home_domain = "domain-b"
    task_role = "writer"

    def write(
        self, topic: str, facts: list[str], groq_key: str | None
    ) -> tuple[str, str]:
        if not groq_key:
            return _template(topic, facts), "template (no GROQ_API_KEY set)"
        try:
            return _crew_summary(topic, facts, groq_key), "crewai + groq"
        except Exception as exc:  # noqa: BLE001
            return _template(
                topic, facts
            ), f"template (LLM failed: {type(exc).__name__}: {str(exc)[:160]})"
