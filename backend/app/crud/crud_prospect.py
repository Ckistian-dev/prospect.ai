import logging
import random
from sqlalchemy import select, func, or_
from sqlalchemy.orm import joinedload, selectinload
from sqlalchemy.ext.asyncio import AsyncSession
from app.db import models
from app.db.schemas import ProspectCreate, ProspectUpdate
from datetime import datetime, timedelta, timezone
from typing import List, Tuple, Optional, Dict, Any
from app.crud import crud_contact

logger = logging.getLogger(__name__)

async def get_prospect(db: AsyncSession, prospect_id: int, user_id: int) -> Optional[models.Prospect]:
    """Busca uma prospecção específica, carregando seus contatos de forma otimizada."""
    result = await db.execute(
        select(models.Prospect)
        .options(selectinload(models.Prospect.contacts).selectinload(models.ProspectContact.contact))
        .where(models.Prospect.id == prospect_id, models.Prospect.user_id == user_id)
    )
    return result.scalars().first()

async def get_prospects_by_user(db: AsyncSession, user_id: int) -> List[models.Prospect]:
    """Lista todas as prospecções de um usuário, carregando os contatos de forma otimizada."""
    result = await db.execute(
        select(models.Prospect)
        .where(models.Prospect.user_id == user_id)
        .options(selectinload(models.Prospect.contacts))
        .order_by(models.Prospect.created_at.desc())
    )
    return result.scalars().unique().all()

async def create_prospect(db: AsyncSession, prospect_in: ProspectCreate, user_id: int) -> models.Prospect:
    """Cria uma nova prospecção e associa os contatos iniciais."""
    db_prospect = models.Prospect(
        **prospect_in.model_dump(exclude={"contact_ids"}),
        user_id=user_id,
        status="Pendente"
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
    
    await db.refresh(db_prospect, attribute_names=['contacts'])
    return db_prospect

async def update_prospect(db: AsyncSession, *, db_prospect: models.Prospect, prospect_in: ProspectUpdate) -> models.Prospect:
    """Atualiza os campos de uma prospecção existente."""
    update_data = prospect_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        if field != 'contact_ids_to_add':
            setattr(db_prospect, field, value)
    db.add(db_prospect)
    await db.commit()
    await db.refresh(db_prospect)
    return db_prospect

async def update_prospect_and_add_contacts(db: AsyncSession, prospect: models.Prospect, update_data: ProspectUpdate) -> models.Prospect:
    """Atualiza os dados de uma prospecção e adiciona novos contatos, evitando duplicatas."""
    update_dict = update_data.model_dump(exclude_unset=True)
    
    contact_ids_to_add = update_dict.pop('contact_ids_to_add', [])

    for key, value in update_dict.items():
        setattr(prospect, key, value)

    if contact_ids_to_add:
        existing_contact_ids_query = await db.execute(
            select(models.ProspectContact.contact_id).where(models.ProspectContact.prospect_id == prospect.id)
        )
        existing_contact_ids = {row[0] for row in existing_contact_ids_query}
        
        for contact_id in contact_ids_to_add:
            if contact_id not in existing_contact_ids:
                new_prospect_contact = models.ProspectContact(
                    prospect_id=prospect.id,
                    contact_id=contact_id
                )
                db.add(new_prospect_contact)
    
    await db.commit()
    
    await db.refresh(prospect, attribute_names=['contacts'])
    return prospect

async def delete_prospect(db: AsyncSession, prospect_to_delete: models.Prospect) -> models.Prospect:
    """Deleta uma prospecção."""
    await db.delete(prospect_to_delete)
    await db.commit()
    return prospect_to_delete

async def get_prospects_para_processar(db: AsyncSession, prospect: models.Prospect) -> Optional[Tuple[models.ProspectContact, models.Contact]]:
    """Busca o próximo contato a ser processado com base na prioridade."""

    # 1. Prioridade Máxima: Respostas recebidas que precisam de atenção.
    # (Esta parte permanece inalterada)
    replies_query = (
        select(models.ProspectContact, models.Contact)
        .join(models.Contact, models.ProspectContact.contact_id == models.Contact.id)
        .where(models.ProspectContact.prospect_id == prospect.id, models.ProspectContact.situacao == "Resposta Recebida")
        .order_by(models.ProspectContact.updated_at.asc()).limit(1)
    )
    next_contact = (await db.execute(replies_query)).first()
    if next_contact:
        return next_contact

    # 2. Segunda Prioridade: Follow-ups para contatos que não responderam.
    if prospect.followup_interval_minutes and prospect.followup_interval_minutes > 0:
        time_limit = datetime.now(timezone.utc) - timedelta(minutes=prospect.followup_interval_minutes)

        # --- LÓGICA DE EXCLUSÃO AQUI ---
        # Definimos todos os status que devem ser ignorados pela lógica de follow-up.
        situacoes_a_ignorar = [
            "Não Interessado", 
            "Concluído", 
            "Falha no Envio",
            "Resposta Recebida", # Já tratado pela primeira query (maior prioridade)
            "Aguardando Início"   # Já tratado pela última query (menor prioridade)
        ]

        followup_query = (
            select(models.ProspectContact, models.Contact)
            .join(models.Contact, models.ProspectContact.contact_id == models.Contact.id)
            .where(
                models.ProspectContact.prospect_id == prospect.id,
                # A condição principal: a situação NÃO PODE ESTAR na lista de ignorados.
                models.ProspectContact.situacao.notin_(situacoes_a_ignorar),
                # E o tempo de espera foi atingido.
                models.ProspectContact.updated_at < time_limit
            )
            .order_by(models.ProspectContact.updated_at.asc()).limit(1)
        )
        next_contact = (await db.execute(followup_query)).first()
        if next_contact:
            return next_contact

    # 3. Terceira Prioridade: Iniciar conversa com novos contatos.
    # (Esta parte permanece inalterada)
    initial_query = (
        select(models.ProspectContact, models.Contact)
        .join(models.Contact, models.ProspectContact.contact_id == models.Contact.id)
        .where(models.ProspectContact.prospect_id == prospect.id, models.ProspectContact.situacao == "Aguardando Início")
        .order_by(models.ProspectContact.id.asc()).limit(1)
    )
    next_contact = (await db.execute(initial_query)).first()
    if next_contact:
        return next_contact

    return None

async def get_active_campaigns(db: AsyncSession) -> List[models.Prospect]:
    """
    Busca todas as campanhas de prospecção que estão com status 'Em Andamento'.
    """
    result = await db.execute(
        select(models.Prospect)
        .where(models.Prospect.status == "Em Andamento")
        .order_by(models.Prospect.created_at.asc())
    )
    return result.scalars().all()


async def get_prospect_contact_by_id(db: AsyncSession, prospect_contact_id: int) -> Optional[models.ProspectContact]:
    """Busca um ProspectContact específico pelo seu ID."""
    result = await db.execute(
        select(models.ProspectContact).where(models.ProspectContact.id == prospect_contact_id)
    )
    return result.scalars().first()

async def delete_prospect_contact(db: AsyncSession, prospect_contact_to_delete: models.ProspectContact):
    """Remove um contato de uma prospecção (deleta a linha de associação)."""
    await db.delete(prospect_contact_to_delete)
    await db.commit()

async def update_prospect_contact(db: AsyncSession, pc_id: int, situacao: str, conversa: Optional[str] = None, observacoes: Optional[str] = None):
    """Atualiza os dados de um único contato dentro de uma prospecção."""
    prospect_contact = await db.get(models.ProspectContact, pc_id)
    if prospect_contact:
        if situacao is not None: prospect_contact.situacao = situacao
        if conversa is not None: prospect_contact.conversa = conversa
        if observacoes is not None: prospect_contact.observacoes = observacoes
        prospect_contact.updated_at = datetime.now(timezone.utc)
        await db.commit()

async def update_prospect_contact_status(db: AsyncSession, pc_id: int, situacao: str):
    """Atualiza apenas o status de um contato (usado pelo webhook)."""
    prospect_contact = await db.get(models.ProspectContact, pc_id)
    if prospect_contact:
        prospect_contact.situacao = situacao
        prospect_contact.updated_at = datetime.now(timezone.utc)
        await db.commit()

async def update_prospect_contact_conversation(db: AsyncSession, pc_id: int, conversa: str):
    """Atualiza apenas o histórico de conversa de um contato."""
    prospect_contact = await db.get(models.ProspectContact, pc_id)
    if prospect_contact:
        prospect_contact.conversa = conversa
        await db.commit()

async def get_contact_details_from_prospect_contact(db: AsyncSession, pc_id: int) -> Optional[models.Contact]:
    """Busca os detalhes de um Contato a partir de um ProspectContact ID."""
    result = await db.execute(
        select(models.Contact)
        .join(models.ProspectContact, models.Contact.id == models.ProspectContact.contact_id)
        .where(models.ProspectContact.id == pc_id)
    )
    return result.scalars().first()

async def find_prospect_contact_by_number(db: AsyncSession, user_id: int, number: str) -> Optional[Tuple[models.Contact, models.ProspectContact, models.Prospect]]:
    """Encontra um contato em uma campanha ativa, lidando com a variação do nono dígito."""
    clean_number = "".join(filter(str.isdigit, str(number)))
    possible_numbers = {clean_number}

    if clean_number.startswith("55") and len(clean_number) in [12, 13]:
        country_code = "55"
        ddd = clean_number[2:4]
        
        if len(clean_number) == 13 and clean_number[4] == '9':
            number_part = clean_number[5:]
            possible_numbers.add(f"{country_code}{ddd}{number_part}")
        
        elif len(clean_number) == 12:
            number_part = clean_number[4:]
            possible_numbers.add(f"{country_code}{ddd}9{number_part}")

    logger.info(f"Procurando contato ativo para os números: {list(possible_numbers)}")

    result = await db.execute(
        select(models.Contact, models.ProspectContact, models.Prospect)
        .join(models.ProspectContact, models.Contact.id == models.ProspectContact.contact_id)
        .join(models.Prospect, models.Prospect.id == models.ProspectContact.prospect_id)
        .where(
            models.Contact.whatsapp.in_(list(possible_numbers)),
            models.Prospect.user_id == user_id,
        )
        .order_by(models.Prospect.created_at.desc())
    )
    return result.first()


async def get_prospect_contacts_with_details(db: AsyncSession, prospect_id: int):
    """Busca todos os contatos associados a uma prospecção com seus detalhes."""
    result = await db.execute(
        select(models.ProspectContact, models.Contact)
        .join(models.Contact, models.ProspectContact.contact_id == models.Contact.id)
        .where(models.ProspectContact.prospect_id == prospect_id)
        .options(joinedload(models.ProspectContact.contact))
    )
    return result.all()

async def get_dashboard_data(db: AsyncSession, user_id: int, start_date: Optional[datetime] = None, end_date: Optional[datetime] = None) -> Dict[str, Any]:
    """Coleta e retorna dados agregados para o dashboard."""
    
    now_utc = datetime.now(timezone.utc)
    if not end_date:
        end_date = now_utc
    if not start_date:
        start_date = end_date - timedelta(days=30)

    # --- STATS CARDS ---
    total_contacts_result = await db.execute(select(func.count(models.Contact.id)).where(models.Contact.user_id == user_id))
    total_contacts = total_contacts_result.scalar_one_or_none() or 0
    
    active_prospects_query = select(func.count(models.Prospect.id)).where(models.Prospect.user_id == user_id, models.Prospect.status == "Em Andamento")
    active_prospects = (await db.execute(active_prospects_query)).scalar_one_or_none() or 0

    base_pc_query = select(models.ProspectContact).join(models.Prospect).where(
        models.Prospect.user_id == user_id,
        models.ProspectContact.updated_at.between(start_date, end_date)
    )

    qualified_leads_query = select(func.count()).select_from(
        base_pc_query.where(models.ProspectContact.situacao == "Lead Qualificado").subquery()
    )
    qualified_leads = (await db.execute(qualified_leads_query)).scalar_one_or_none() or 0

    sent_statuses = ["Aguardando Resposta", "Resposta Recebida", "Reunião Agendada", "Não Interessado", "Concluído", "Lead Qualificado", "Falha no Envio"]
    replied_statuses = ["Resposta Recebida", "Reunião Agendada", "Não Interessado", "Concluído", "Lead Qualificado"]
    
    total_sent_query = select(func.count()).select_from(
        base_pc_query.where(models.ProspectContact.situacao.in_(sent_statuses)).subquery()
    )
    total_sent = (await db.execute(total_sent_query)).scalar_one_or_none() or 0

    total_replied_query = select(func.count()).select_from(
        base_pc_query.where(models.ProspectContact.situacao.in_(replied_statuses)).subquery()
    )
    total_replied = (await db.execute(total_replied_query)).scalar_one_or_none() or 0
    
    response_rate = (total_replied / total_sent * 100) if total_sent > 0 else 0

    # --- RECENT CAMPAIGNS (não muda) ---
    recent_campaigns_query = (
        select(models.Prospect)
        .where(models.Prospect.user_id == user_id)
        .options(selectinload(models.Prospect.contacts))
        .order_by(models.Prospect.created_at.desc())
        .limit(4)
    )
    recent_campaigns_result = await db.execute(recent_campaigns_query)
    recent_campaigns = recent_campaigns_result.scalars().unique().all()
    
    # --- ACTIVITY CHART ---
    sent_query = select(
            func.date_trunc('day', models.ProspectContact.updated_at).label('day'),
            func.count(models.ProspectContact.id).label('count')
        ).join(models.Prospect).where(
            models.Prospect.user_id == user_id,
            models.ProspectContact.updated_at.between(start_date, end_date),
            models.ProspectContact.situacao.in_(sent_statuses)
        ).group_by('day').order_by('day')

    replied_query = select(
            func.date_trunc('day', models.ProspectContact.updated_at).label('day'),
            func.count(models.ProspectContact.id).label('count')
        ).join(models.Prospect).where(
            models.Prospect.user_id == user_id,
            models.ProspectContact.updated_at.between(start_date, end_date),
            models.ProspectContact.situacao.in_(replied_statuses)
        ).group_by('day').order_by('day')

    sent_results = await db.execute(sent_query)
    replied_results = await db.execute(replied_query)

    all_days_in_period = {}
    current_day = start_date
    while current_day <= end_date:
        day_key = current_day.strftime('%d/%m')
        all_days_in_period[day_key] = {"date": day_key, "contatos": 0, "respostas": 0}
        current_day += timedelta(days=1)

    for row in sent_results.mappings().all():
        day_key = row['day'].strftime('%d/%m')
        if day_key in all_days_in_period:
            all_days_in_period[day_key]['contatos'] = row.get('count', 0)

    for row in replied_results.mappings().all():
        day_key = row['day'].strftime('%d/%m')
        if day_key in all_days_in_period:
            all_days_in_period[day_key]['respostas'] = row.get('count', 0)

    activity_data = list(all_days_in_period.values())

    # --- RECENT ACTIVITY (para o ticker do header) ---
    recent_activity_query = (
        select(models.ProspectContact, models.Contact, models.Prospect)
        .join(models.Prospect, models.Prospect.id == models.ProspectContact.prospect_id)
        .join(models.Contact, models.Contact.id == models.ProspectContact.contact_id)
        .where(models.Prospect.user_id == user_id)
        .order_by(models.ProspectContact.updated_at.desc())
        .limit(1)
    )
    recent_activity_result = (await db.execute(recent_activity_query)).first()
    recent_activity = None
    if recent_activity_result:
        pc, contact, prospect = recent_activity_result
        recent_activity = {
            "id": pc.id, 
            "campaignName": prospect.nome_prospeccao,
            "contactName": contact.nome,
            "situacao": pc.situacao, 
            "observacao": pc.observacoes
        }

    return {
        "stats": {
            "totalContacts": total_contacts,
            "activeProspects": active_prospects,
            "qualifiedLeads": qualified_leads,
            "responseRate": f"{response_rate:.1f}%"
        },
        "recentCampaigns": [
            {"id": c.id, "name": c.nome_prospeccao, "status": c.status, "timeAgo": (now_utc - c.created_at).days if c.created_at else -1} 
            for c in recent_campaigns
        ],
        "activityChart": activity_data,
        "recentActivity": [recent_activity] if recent_activity else []
    }
