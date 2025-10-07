import logging
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
    
    await db.refresh(db_prospect, attribute_names=['contacts'])
    return db_prospect

# --- FUNÇÃO REINTRODUZIDA ---
# Esta função é usada para atualizações simples, como mudar o status da campanha.
async def update_prospect(db: AsyncSession, *, db_prospect: models.Prospect, prospect_in: ProspectUpdate) -> models.Prospect:
    """Atualiza os campos de uma prospecção existente."""
    update_data = prospect_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        # Ignora a tentativa de atualizar a lista de contatos aqui
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

async def append_to_log(db: AsyncSession, prospect_id: int, message: str, new_status: Optional[str] = None):
    """Adiciona uma nova linha ao log de uma prospecção."""
    prospect = await db.get(models.Prospect, prospect_id)
    if prospect:
        timestamp = datetime.now(timezone(timedelta(hours=-3))).strftime('%H:%M:%S')
        prospect.log += f"[{timestamp}] {message}\n"
        if new_status:
            prospect.status = new_status
        await db.commit()

async def get_prospects_para_processar(db: AsyncSession, prospect: models.Prospect) -> Optional[Tuple[models.ProspectContact, models.Contact]]:
    """Busca o próximo contato a ser processado com base na prioridade."""
    replies_query = (
        select(models.ProspectContact, models.Contact)
        .join(models.Contact, models.ProspectContact.contact_id == models.Contact.id)
        .where(models.ProspectContact.prospect_id == prospect.id, models.ProspectContact.situacao == "Resposta Recebida")
        .order_by(models.ProspectContact.updated_at.asc()).limit(1)
    )
    next_contact = (await db.execute(replies_query)).first()
    if next_contact: return next_contact

    if prospect.followup_interval_minutes and prospect.followup_interval_minutes > 0:
        time_limit = datetime.now(timezone.utc) - timedelta(minutes=prospect.followup_interval_minutes)
        followup_query = (
            select(models.ProspectContact, models.Contact)
            .join(models.Contact, models.ProspectContact.contact_id == models.Contact.id)
            .where(models.ProspectContact.prospect_id == prospect.id, models.ProspectContact.situacao == "Aguardando Resposta", models.ProspectContact.updated_at < time_limit)
            .order_by(models.ProspectContact.updated_at.asc()).limit(1)
        )
        next_contact = (await db.execute(followup_query)).first()
        if next_contact: return next_contact

    initial_query = (
        select(models.ProspectContact, models.Contact)
        .join(models.Contact, models.ProspectContact.contact_id == models.Contact.id)
        .where(models.ProspectContact.prospect_id == prospect.id, models.ProspectContact.situacao == "Aguardando Início")
        .order_by(models.ProspectContact.id.asc()).limit(1)
    )
    next_contact = (await db.execute(initial_query)).first()
    if next_contact: return next_contact

    return None

async def update_prospect_contact(db: AsyncSession, pc_id: int, situacao: str, conversa: Optional[str] = None, observacoes: Optional[str] = None):
    """Atualiza os dados de um único contato dentro de uma prospecção."""
    prospect_contact = await db.get(models.ProspectContact, pc_id)
    if prospect_contact:
        prospect_contact.situacao = situacao
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

async def find_active_prospect_contact_by_number(db: AsyncSession, user_id: int, number: str) -> Optional[Tuple[models.Contact, models.ProspectContact, models.Prospect]]:
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
            models.Prospect.status == "Em Andamento"
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