"""Groq chat calls for the agents. One place for the key, the model and the
token accounting. Raises LlmError on any failure so callers can fall back."""

from __future__ import annotations

import asyncio
import os
import time
from dataclasses import dataclass

from dotenv import dotenv_values

from app.agents.client import ENV_DIR

DEFAULT_MODEL = "openai/gpt-oss-20b"


class LlmError(Exception):
    pass


@dataclass(frozen=True)
class LlmSettings:
    api_key: str | None
    model: str


@dataclass(frozen=True)
class LlmResult:
    text: str
    model: str
    latency_ms: float
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int


def load_settings() -> LlmSettings:
    file_env = dotenv_values(ENV_DIR / "agents.env")
    key = os.environ.get("GROQ_API_KEY") or file_env.get("GROQ_API_KEY")
    model = os.environ.get("GROQ_MODEL") or file_env.get("GROQ_MODEL") or DEFAULT_MODEL
    return LlmSettings(key or None, model)


def available() -> bool:
    return load_settings().api_key is not None


def complete_sync(
    system: str,
    user: str,
    *,
    max_tokens: int = 700,
    temperature: float = 0.3,
    api_key: str | None = None,
) -> LlmResult:
    settings = load_settings()
    key = api_key or settings.api_key
    if not key:
        raise LlmError("GROQ_API_KEY is not set")
    try:
        from groq import Groq
    except ImportError as exc:
        raise LlmError("the groq package is not installed") from exc

    client = Groq(api_key=key, timeout=30.0, max_retries=1)
    extra = (
        {"reasoning_effort": "low"}
        if settings.model.startswith("openai/gpt-oss")
        else None
    )
    t0 = time.perf_counter()
    try:
        resp = client.chat.completions.create(
            model=settings.model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            temperature=temperature,
            max_completion_tokens=max_tokens,
            extra_body=extra,
        )
    except Exception as exc:  # network, auth, rate limit, bad model
        raise LlmError(f"{type(exc).__name__}: {str(exc)[:160]}") from exc
    latency = (time.perf_counter() - t0) * 1000
    text = (resp.choices[0].message.content or "").strip()
    if not text:
        raise LlmError("empty reply (the model spent its whole token budget thinking)")
    usage = resp.usage
    return LlmResult(
        text=text,
        model=settings.model,
        latency_ms=latency,
        prompt_tokens=usage.prompt_tokens if usage else 0,
        completion_tokens=usage.completion_tokens if usage else 0,
        total_tokens=usage.total_tokens if usage else 0,
    )


async def complete(
    system: str, user: str, *, max_tokens: int = 700, temperature: float = 0.3
) -> LlmResult:
    return await asyncio.to_thread(
        complete_sync, system, user, max_tokens=max_tokens, temperature=temperature
    )
