"""Domain B agent. Template summary by default; Groq LLM when a key is
configured. Any LLM failure falls back to the template."""

from __future__ import annotations

from app.agents import llm, prompts


def template(topic: str, facts: list[str]) -> str:
    body = " ".join(f"({i}) {f}" for i, f in enumerate(facts, 1))
    return f"Summary on {topic}: {body}"


class WriterAgent:
    name = "writer-agent"
    home_domain = "domain-b"
    task_role = "writer"

    @staticmethod
    def fallback(topic: str, facts: list[str]) -> str:
        return template(topic, facts)

    def write(
        self, topic: str, facts: list[str], groq_key: str | None
    ) -> tuple[str, str]:
        if not groq_key:
            return template(topic, facts), "template (no GROQ_API_KEY set)"
        try:
            res = llm.complete_sync(
                prompts.SUMMARY_SYSTEM,
                prompts.summary_user(topic, facts),
                api_key=groq_key,
            )
            return res.text, f"groq {res.model}"
        except llm.LlmError as exc:
            return template(topic, facts), f"template (LLM failed: {exc})"
