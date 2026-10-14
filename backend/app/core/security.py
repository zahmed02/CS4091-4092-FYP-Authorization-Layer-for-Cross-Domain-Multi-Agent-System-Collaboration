"""
Ed25519 key handling and capability-token (JWT) signing primitives.

Only EdDSA is accepted. The algorithm is pinned on both signing and
verification so a forged token cannot downgrade it (alg confusion attacks).
"""

import hashlib
from functools import lru_cache

import jwt
from cryptography.exceptions import UnsupportedAlgorithm
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import (
    Ed25519PrivateKey,
    Ed25519PublicKey,
)

from app.core.config import get_settings

settings = get_settings()

ALGORITHM = settings.jwt_algorithm
if ALGORITHM != "EdDSA":
    raise RuntimeError(
        f"JWT_ALGORITHM must be 'EdDSA' for this system, got '{ALGORITHM}'."
    )


@lru_cache
def get_private_key() -> Ed25519PrivateKey:
    data = settings.jwt_private_key_full_path.read_bytes()
    key = serialization.load_pem_private_key(data, password=None)
    if not isinstance(key, Ed25519PrivateKey):
        raise RuntimeError("Configured private key is not an Ed25519 key.")
    return key


@lru_cache
def get_public_key() -> Ed25519PublicKey:
    data = settings.jwt_public_key_full_path.read_bytes()
    key = serialization.load_pem_public_key(data)
    if not isinstance(key, Ed25519PublicKey):
        raise RuntimeError("Configured public key is not an Ed25519 key.")
    return key


def public_key_to_pem(key: Ed25519PublicKey) -> str:
    return key.public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode("ascii")


def parse_public_key_pem(pem: str) -> Ed25519PublicKey:
    """Parse and validate a PEM public key. Raises ValueError if unusable."""
    try:
        key = serialization.load_pem_public_key(pem.encode("utf-8"))
    except (ValueError, TypeError, UnsupportedAlgorithm) as exc:
        raise ValueError("Not a valid PEM-encoded public key.") from exc
    if not isinstance(key, Ed25519PublicKey):
        raise ValueError("Public key must be an Ed25519 key.")
    return key


def key_fingerprint(key: Ed25519PublicKey) -> str:
    raw = key.public_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PublicFormat.Raw,
    )
    return "SHA256:" + hashlib.sha256(raw).hexdigest()[:32]


def sign_token(claims: dict) -> tuple[str, dict]:
    """Sign claims with this domain's private key. Returns (jwt, header)."""
    token = jwt.encode(
        claims,
        get_private_key(),
        algorithm=ALGORITHM,
        headers={"kid": settings.trust_domain_id},
    )
    return token, jwt.get_unverified_header(token)
