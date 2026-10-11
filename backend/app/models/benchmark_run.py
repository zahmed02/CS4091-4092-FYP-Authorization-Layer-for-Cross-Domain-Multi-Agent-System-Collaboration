import uuid
from datetime import datetime

from sqlalchemy import DateTime, Integer, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class BenchmarkRun(Base):
    __tablename__ = "benchmark_run"

    run_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    run_type: Mapped[str] = mapped_column(
        String(50), nullable=False
    )  # "token" / "baseline"
    agent_count: Mapped[int] = mapped_column(Integer, nullable=False)
    concurrent_tasks: Mapped[int] = mapped_column(Integer, nullable=False)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    measurements: Mapped[list["BenchmarkMeasurement"]] = relationship(
        back_populates="run"
    )
