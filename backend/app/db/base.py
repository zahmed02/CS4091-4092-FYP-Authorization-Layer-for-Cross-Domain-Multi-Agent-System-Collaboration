"""
Declarative base for all ORM models. Kept separate from session.py so
Alembic can import it without pulling in the async engine.
"""

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass
