from fastapi import APIRouter, Depends
from sqlalchemy import select

from app.api.deps import DbSession, require_admin
from app.models import Team
from app.schemas.team import TeamCreate, TeamOut
from app.services.trust_service import get_self_domain

router = APIRouter(
    prefix="/teams", tags=["teams"], dependencies=[Depends(require_admin)]
)


@router.post("", response_model=TeamOut, status_code=201)
async def create_team(body: TeamCreate, db: DbSession) -> Team:
    domain = await get_self_domain(db)
    team = Team(trust_domain_id=domain.trust_domain_id, name=body.name)
    db.add(team)
    await db.commit()
    await db.refresh(team)
    return team


@router.get("", response_model=list[TeamOut])
async def list_teams(db: DbSession) -> list[Team]:
    result = await db.execute(select(Team).order_by(Team.created_at))
    return list(result.scalars().all())
