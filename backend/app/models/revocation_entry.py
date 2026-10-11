import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class RevocationEntry(Base):
    __tablename__ = "revocation_entry"

    revocation_reference: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("token_issuance.revocation_reference"),
        primary_key=True,
    )
    revoked_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    ttl_expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    token: Mapped["TokenIssuance"] = relationship(back_populates="revocation")
