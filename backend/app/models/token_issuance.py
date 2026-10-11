import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class TokenIssuance(Base):
    __tablename__ = "token_issuance"

    revocation_reference: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )  # also used as the JWT's "jti" claim
    team_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("team.team_id"), nullable=False
    )
    role: Mapped[str] = mapped_column(String(100), nullable=False)
    permitted_actions: Mapped[list[str]] = mapped_column(JSONB, nullable=False)
    issued_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    issuer: Mapped[str] = mapped_column(String(100), nullable=False)

    team: Mapped["Team"] = relationship(back_populates="tokens")
    revocation: Mapped["RevocationEntry | None"] = relationship(
        back_populates="token", uselist=False
    )
    audit_events: Mapped[list["AuditLogEvent"]] = relationship(back_populates="token")
