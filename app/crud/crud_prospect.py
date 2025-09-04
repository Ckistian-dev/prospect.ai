import logging
from sqlalchemy import select
from sqlalchemy.orm import joinedload
from sqlalchemy.ext.asyncio import AsyncSession
from app.db import models
from app.db.schemas import ProspectCreate, ProspectUpdate
from datetime import datetime
from typing import List, Tuple, Optional

# --- Depuração Adicionada ---
logger = logging.getLogger(__name__)

async def get_prospect(db: AsyncSession, prospect_id: int, user_id: int) -> Optional[models.Prospect]:
    result = await db.execute(
        select(models.Prospect).where(models.Prospect.id == prospect_id, models.Prospect.user_id == user_id)
    )
    return result.scalars().first()

async def get_prospects_by_user(db: AsyncSession, user_id: int) -> List[models.Prospect]:
    """
    Busca todas as prospecções de um usuário, carregando os contatos relacionados
    de forma antecipada (eager loading) para evitar erros de lazy-loading.
    """
    result = await db.execute(
        select(models.Prospect)
        .where(models.Prospect.user_id == user_id)
        .options(joinedload(models.Prospect.contacts))
        .order_by(models.Prospect.created_at.desc())
    )
    return result.scalars().unique().all()

async def create_prospect(db: AsyncSession, prospect_in: ProspectCreate, user_id: int) -> models.Prospect:
    """
    Cria uma nova prospecção e associa os contatos a ela.
    """
    db_prospect = models.Prospect(
        **prospect_in.model_dump(exclude={"contact_ids"}),
        user_id=user_id,
        status="Pendente",
        log=f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Campanha criada.\n"
    )
    db.add(db_prospect)
    await db.commit()
    await db.refresh(db_prospect)
    logger.info(f"DEBUG: Prospecção ID {db_prospect.id} criada para o usuário ID {user_id}.")

    for contact_id in prospect_in.contact_ids:
        db_prospect_contact = models.ProspectContact(
            prospect_id=db_prospect.id,
            contact_id=contact_id,
            situacao="Aguardando Início",
            conversa="[]",
            observacoes="", # Garante que o campo seja inicializado.
            media_type=None
        )
        db.add(db_prospect_contact)
    
    await db.commit()
    await db.refresh(db_prospect)
    logger.info(f"DEBUG: {len(prospect_in.contact_ids)} contatos associados à prospecção ID {db_prospect.id}.")
    return db_prospect

async def update_prospect(db: AsyncSession, *, db_prospect: models.Prospect, prospect_in: ProspectUpdate) -> models.Prospect:
    """
    Atualiza os dados de uma prospecção (ex: nome, status).
    """
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
        timestamp = datetime.now().strftime('%H:%M:%S')
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
    
async def update_prospect_contact(
    db: AsyncSession, 
    pc_id: int, 
    situacao: str, 
    conversa: Optional[str] = None,
    observacoes: Optional[str] = None,
    media_type: Optional[str] = None
):
    """
    Atualiza um contato de prospecção. As novas observações sobrescrevem as antigas.
    """
    prospect_contact = await db.get(models.ProspectContact, pc_id)
    if prospect_contact:
        logger.debug(f"DEBUG: Atualizando ProspectContact ID {pc_id}. Nova situação: {situacao}")
        prospect_contact.situacao = situacao
        if conversa is not None:
            prospect_contact.conversa = conversa
        if observacoes is not None:
            logger.debug(f"DEBUG: Sobrescrevendo observação para ProspectContact ID {pc_id} com: '{observacoes[:50]}...'")
            prospect_contact.observacoes = observacoes
        if media_type is not None:
            logger.debug(f"DEBUG: Atualizando media_type para ProspectContact ID {pc_id} para: '{media_type}'")
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
    
    logger.info(f"DEBUG: Procurando contato ativo para o usuário {user_id} com os números: {possible_numbers}")

    result = await db.execute(
        select(models.Contact, models.ProspectContact, models.Prospect)
        .join(models.ProspectContact, models.Contact.id == models.ProspectContact.contact_id)
        .join(models.Prospect, models.Prospect.id == models.ProspectContact.prospect_id)
        .where(
            models.Contact.whatsapp.in_(list(possible_numbers)),
            models.Prospect.user_id == user_id,
            models.Prospect.status == "Em Andamento" # Garante que estamos na campanha ativa
        )
        .order_by(models.Prospect.created_at.desc())
    )
    found = result.first()
    if found:
        logger.info(f"DEBUG: Contato encontrado: {found.Contact.nome} na prospecção '{found.Prospect.nome_prospeccao}'.")
    else:
        logger.warning(f"DEBUG: Nenhum contato ativo encontrado para os números {possible_numbers}.")
    return found

