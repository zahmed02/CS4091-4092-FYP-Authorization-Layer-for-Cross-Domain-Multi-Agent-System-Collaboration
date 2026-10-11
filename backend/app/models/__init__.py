"""
Importing this package registers every model on Base.metadata, which is
what Alembic's autogenerate needs to see the full schema.
"""

from app.models.audit_log_event import AuditLogEvent
from app.models.benchmark_measurement import BenchmarkMeasurement
from app.models.benchmark_run import BenchmarkRun
from app.models.enums import AuditEventType, TaskStatus
from app.models.revocation_entry import RevocationEntry
from app.models.task_assignment import TaskAssignment
from app.models.team import Team
from app.models.token_issuance import TokenIssuance
from app.models.trust_domain import TrustDomain

__all__ = [
    "AuditLogEvent",
    "AuditEventType",
    "BenchmarkMeasurement",
    "BenchmarkRun",
    "RevocationEntry",
    "TaskAssignment",
    "TaskStatus",
    "Team",
    "TokenIssuance",
    "TrustDomain",
]
