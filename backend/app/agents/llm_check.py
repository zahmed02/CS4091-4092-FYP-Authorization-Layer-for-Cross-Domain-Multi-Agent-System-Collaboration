"""Check the Groq key and model without printing the key.

Run from the backend folder:
    python -m app.agents.llm_check
Optional: set GROQ_MODEL in infra/docker/agents.env to test another model.
"""

from __future__ import annotations

import os
import sys
import time

from dotenv import dotenv_values

from app.agents.client import ENV_DIR

PREFERRED = ["openai/gpt-oss-20b", "openai/gpt-oss-120b", "qwen/qwen3.8-27b"]


def main() -> int:
    file_env = dotenv_values(ENV_DIR / "agents.env")
    key = os.environ.get("GROQ_API_KEY") or file_env.get("GROQ_API_KEY")
    if not key:
        print("No GROQ_API_KEY found. Put it in infra/docker/agents.env.")
        return 2
    model = os.environ.get("GROQ_MODEL") or file_env.get("GROQ_MODEL") or PREFERRED[0]

    try:
        from groq import Groq
    except ImportError:
        print("The groq package is missing. Run: pip install groq")
        return 2

    client = Groq(api_key=key)
    try:
        available = sorted(m.id for m in client.models.list().data)
    except Exception as exc:  # noqa: BLE001 - network, auth, rate limit
        print(f"Could not list models: {type(exc).__name__}: {exc}")
        return 1
    print(f"Key accepted. {len(available)} models available.")
    for m in PREFERRED:
        print(f"  {'yes' if m in available else 'NO '}  {m}")
    if model not in available:
        print(f"\nModel '{model}' is not available to this key.")
        return 1

    extra = {"reasoning_effort": "low"} if model.startswith("openai/gpt-oss") else {}
    t0 = time.perf_counter()
    try:
        resp = client.chat.completions.create(
            model=model,
            messages=[
                {
                    "role": "user",
                    "content": "In one sentence, why must a capability token be "
                    "re-verified on every request?",
                }
            ],
            temperature=0.2,
            max_completion_tokens=800,
            extra_body=extra or None,
        )
    except Exception as exc:  # noqa: BLE001 - report any failure
        print(f"Chat call failed: {type(exc).__name__}: {exc}")
        return 1
    ms = (time.perf_counter() - t0) * 1000
    u = resp.usage
    print(f"\nModel: {model}")
    print(f"Latency: {ms:.0f} ms")
    if u:
        print(
            f"Tokens: prompt {u.prompt_tokens}, completion {u.completion_tokens}, total {u.total_tokens}"
        )
    print("Reply:", (resp.choices[0].message.content or "").strip() or "(empty reply)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
