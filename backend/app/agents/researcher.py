"""Domain A agent. Deterministic local knowledge base, so no LLM or web access
is needed and every run produces the same facts."""

TOPIC = "capability-token authorization across trust domains"

_FACTS = [
    (
        "Capability tokens are Ed25519-signed JWTs carrying team, audience domains "
        "and permitted actions, so a domain verifies them using only the issuer's "
        "public key."
    ),
    (
        "Verification is a 7-step pipeline (format, issuer key, signature, expiry, "
        "audience, scope, revocation) and takes a few milliseconds in this prototype."
    ),
    (
        "A revocation registry entry lives only as long as the token's remaining "
        "life, so no standing privilege remains and the registry cleans itself up."
    ),
    (
        "Revocations are pushed to peer domains as signed notices, so a token "
        "revoked in one domain is rejected by the others almost immediately."
    ),
]


class ResearcherAgent:
    name = "researcher-agent"
    home_domain = "domain-a"
    task_role = "researcher"

    def research(self) -> list[str]:
        return list(_FACTS)
