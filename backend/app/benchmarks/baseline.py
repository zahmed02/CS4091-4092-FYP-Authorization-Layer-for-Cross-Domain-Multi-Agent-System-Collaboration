"""Baseline model used only for the memory comparison.

This is NOT part of the product. It models the design our system avoids: a
server that stores one identity record per agent plus a revocation list per
agent. Its memory grows with agents (n), attributes per agent (k) and
revocation entries per agent (r), which is the O(r*n*k) curve in the proposal.
It is measured with tracemalloc so the comparison uses real Python memory.
"""

from __future__ import annotations

import tracemalloc
import uuid


def build_registry(agents: int, attributes: int, revocations: int) -> dict[str, dict]:
    registry: dict[str, dict] = {}
    for _ in range(agents):
        record: dict = {f"attr_{j}": uuid.uuid4().hex for j in range(attributes)}
        record["revocations"] = [uuid.uuid4().hex for _ in range(revocations)]
        registry[uuid.uuid4().hex] = record
    return registry


def measure_registry_bytes(agents: int, attributes: int, revocations: int) -> int:
    """Bytes of Python memory held by a per-agent registry for `agents` agents."""
    if agents <= 0:
        return 0
    tracemalloc.start()
    before = tracemalloc.get_traced_memory()[0]
    registry = build_registry(agents, attributes, revocations)
    after = tracemalloc.get_traced_memory()[0]
    tracemalloc.stop()
    del registry
    return max(after - before, 0)
