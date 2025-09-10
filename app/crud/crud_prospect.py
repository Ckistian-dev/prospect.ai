import logging
from sqlalchemy import select, func
from sqlalchemy.orm import joinedload
from sqlalchemy.ext.asyncio import AsyncSession
from app.db import models
from app.db.schemas import ProspectCreate, ProspectUpdate
from datetime import datetime, timedelta, timezone
from typing import List, Tuple, Optional, Dict, Any
from app.crud import crud_contact

logger = logging.getLogger(__name__)

async def get_prospect(db: AsyncSession, prospect_id: int, user_id: int) -> Optional[models.Prospect]:
    result = await db.execute(
        select(models.Prospect).where(models.Prospect.id == prospect_id, models.Prospect.user_id == user_id)
    )
    return result.scalars().first()

async def get_prospects_by_user(db: AsyncSession, user_id: int) -> List[models.Prospect]:
    result = await db.execute(
        select(models.Prospect)
        .where(models.Prospect.user_id == user_id)
        .options(joinedload(models.Prospect.contacts))
        .order_by(models.Prospect.created_at.desc())
    )
    return result.scalars().unique().all()

async def create_prospect(db: AsyncSession, prospect_in: ProspectCreate, user_id: int) -> models.Prospect:
    # A data de criação agora é gerada pelo próprio banco de dados
    db_prospect = models.Prospect(
        **prospect_in.model_dump(exclude={"contact_ids"}),
        user_id=user_id,
        status="Pendente",
        log=f"[{datetime.now(timezone(timedelta(hours=-3))).strftime('%Y-%m-%d %H:%M:%S')}] Campanha criada.\n"
    )
    db.add(db_prospect)
    await db.commit()
    await db.refresh(db_prospect)

    for contact_id in prospect_in.contact_ids:
        db_prospect_contact = models.ProspectContact(
            prospect_id=db_prospect.id,
            contact_id=contact_id
        )
        db.add(db_prospect_contact)
    
    await db.commit()
    await db.refresh(db_prospect)
    return db_prospect

async def update_prospect(db: AsyncSession, *, db_prospect: models.Prospect, prospect_in: ProspectUpdate) -> models.Prospect:
    update_data = prospect_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_prospect, field, value)
    db.add(db_prospect)
    await db.commit()
    await db.refresh(db_prospect)
    return db_prospect

async def append_to_log(db: AsyncSession, prospect_id: int, message: str, new_status: Optional[str] = None):
    prospect = await db.get(models.Prospect, prospect_id)
    if prospect:
        timestamp = datetime.now(timezone(timedelta(hours=-3))).strftime('%H:%M:%S')
        prospect.log += f"[{timestamp}] {message}\n"
        if new_status:
            prospect.status = new_status
        await db.commit()

async def get_prospect_contacts_by_status(db: AsyncSession, prospect_id: int, status: str) -> List[Tuple[models.ProspectContact, models.Contact]]:
    result = await db.execute(
        select(models.ProspectContact, models.Contact)
        .join(models.Contact, models.ProspectContact.contact_id == models.Contact.id)
        .where(
            models.ProspectContact.prospect_id == prospect_id,
            models.ProspectContact.situacao == status
        )
    )
    return result.all()

# --- FUNÇÃO QUE FALTAVA ---
async def get_contacts_for_followup(db: AsyncSession, prospect: models.Prospect):
    """Busca contatos que precisam de follow-up com base no intervalo em minutos."""
    if not prospect.followup_interval_minutes or prospect.followup_interval_minutes <= 0:
        return []
        
    time_limit = datetime.now(timezone.utc) - timedelta(minutes=prospect.followup_interval_minutes)
    
    result = await db.execute(
        select(models.ProspectContact, models.Contact)
        .join(models.Contact)
        .where(
            models.ProspectContact.prospect_id == prospect.id,
            models.ProspectContact.situacao == "Aguardando Resposta",
            models.ProspectContact.updated_at < time_limit
        )
    )
    return result.all()
    
async def update_prospect_contact(
    db: AsyncSession, 
    pc_id: int, 
    situacao: str, 
    conversa: Optional[str] = None,
    observacoes: Optional[str] = None,
    media_type: Optional[str] = None
):
    prospect_contact = await db.get(models.ProspectContact, pc_id)
    if prospect_contact:
        prospect_contact.situacao = situacao
        if conversa is not None:
            prospect_contact.conversa = conversa
        if observacoes is not None:
            prospect_contact.observacoes = observacoes
        if media_type is not None:
            prospect_contact.media_type = media_type
        await db.commit()

async def get_prospect_contacts_with_details(db: AsyncSession, prospect_id: int):
    result = await db.execute(
        select(models.ProspectContact, models.Contact)
        .join(models.Contact, models.ProspectContact.contact_id == models.Contact.id)
        .where(models.ProspectContact.prospect_id == prospect_id)
        .options(joinedload(models.ProspectContact.contact))
    )
    return result.all()

async def find_active_prospect_contact_by_number(db: AsyncSession, user_id: int, number: str) -> Optional[Tuple[models.Contact, models.ProspectContact, models.Prospect]]:
    clean_number = "".join(filter(str.isdigit, str(number)))
    possible_numbers = {clean_number}

    if clean_number.startswith("55") and 12 <= len(clean_number) <= 13:
        prefix = clean_number[:4]
        if len(clean_number) == 13 and clean_number[4] == '9':
            possible_numbers.add(prefix + clean_number[5:])
        elif len(clean_number) == 12:
            possible_numbers.add(f"{prefix}9{clean_number[4:]}")
    
    result = await db.execute(
        select(models.Contact, models.ProspectContact, models.Prospect)
        .join(models.ProspectContact, models.Contact.id == models.ProspectContact.contact_id)
        .join(models.Prospect, models.Prospect.id == models.ProspectContact.prospect_id)
        .where(
            models.Contact.whatsapp.in_(list(possible_numbers)),
            models.Prospect.user_id == user_id
        )
        .order_by(models.Prospect.created_at.desc())
    )
    return result.first()

async def get_dashboard_data(db: AsyncSession, user_id: int) -> Dict[str, Any]:
    total_contacts = await crud_contact.get_total_contacts_count(db, user_id=user_id)
    
    active_prospects_query = select(func.count(models.Prospect.id)).where(models.Prospect.user_id == user_id, models.Prospect.status == "Em Andamento")
    active_prospects = (await db.execute(active_prospects_query)).scalar_one_or_none() or 0

    qualified_leads_query = select(func.count(models.ProspectContact.id)).join(models.Prospect).where(models.Prospect.user_id == user_id, models.ProspectContact.situacao == "Lead Qualificado")
    qualified_leads = (await db.execute(qualified_leads_query)).scalar_one_or_none() or 0

    sent_statuses = ["Aguardando Resposta", "Resposta Recebida", "Reunião Agendada", "Não Interessado", "Concluído", "Lead Qualificado", "Falha no Envio"]
    replied_statuses = ["Resposta Recebida", "Reunião Agendada", "Não Interessado", "Concluído", "Lead Qualificado"]
    
    total_sent_query = select(func.count(models.ProspectContact.id)).join(models.Prospect).where(models.Prospect.user_id == user_id, models.ProspectContact.situacao.in_(sent_statuses))
    total_sent = (await db.execute(total_sent_query)).scalar_one_or_none() or 0

    total_replied_query = select(func.count(models.ProspectContact.id)).join(models.Prospect).where(models.Prospect.user_id == user_id, models.ProspectContact.situacao.in_(replied_statuses))
    total_replied = (await db.execute(total_replied_query)).scalar_one_or_none() or 0
    
    response_rate = (total_replied / total_sent * 100) if total_sent > 0 else 0

    recent_campaigns_query = (
        select(models.Prospect)
        .where(models.Prospect.user_id == user_id)
        .options(joinedload(models.Prospect.contacts))
        .order_by(models.Prospect.created_at.desc())
        .limit(5)
    )
    recent_campaigns_result = await db.execute(recent_campaigns_query)
    recent_campaigns = recent_campaigns_result.scalars().unique().all()
    
    now_utc = datetime.now(timezone.utc)

    activity_data = []
    month_names = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]
    for i in range(7):
        month_date = now_utc - timedelta(days=i*30)
        month_name = month_names[month_date.month - 1]
        activity_data.append({
            "name": month_name,
            "contatos": total_sent // 7,
            "respostas": total_replied // 7
        })
    activity_data.reverse()

    return {
        "stats": {
            "totalContacts": total_contacts,
            "activeProspects": active_prospects,
            "qualifiedLeads": qualified_leads,
            "responseRate": f"{response_rate:.1f}%"
        },
        "recentCampaigns": [
            {"name": c.nome_prospeccao, "status": c.status, "timeAgo": (now_utc - c.created_at).days if c.created_at else -1} 
            for c in recent_campaigns
        ],
        "activityChart": activity_data
    }

