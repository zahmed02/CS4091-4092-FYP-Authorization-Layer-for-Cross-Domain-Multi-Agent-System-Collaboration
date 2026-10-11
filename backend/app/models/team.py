import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Team(Base):
    __tablename__ = "team"

    team_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    trust_domain_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("trust_domain.trust_domain_id"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    trust_domain: Mapped["TrustDomain"] = relationship(back_populates="teams")
    tokens: Mapped[list["TokenIssuance"]] = relationship(back_populates="team")
    task_assignments: Mapped[list["TaskAssignment"]] = relationship(
        back_populates="team"
    )
    audit_events: Mapped[list["AuditLogEvent"]] = relationship(back_populates="team")
