from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession
from app.db import models
from app.db.schemas import ProspectCreate, ProspectUpdate
from datetime import datetime
from typing import List, Tuple, Optional

async def get_prospect(db: AsyncSession, prospect_id: int, user_id: int) -> models.Prospect | None:
    result = await db.execute(
        select(models.Prospect).where(models.Prospect.id == prospect_id, models.Prospect.user_id == user_id)
    )
    return result.scalars().first()

async def get_prospects_by_user(db: AsyncSession, user_id: int) -> List[models.Prospect]:
    result = await db.execute(
        select(models.Prospect)
        .where(models.Prospect.user_id == user_id)
        .options(selectinload(models.Prospect.contacts))
        .order_by(models.Prospect.created_at.desc())
    )
    return result.scalars().all()

async def create_prospect(db: AsyncSession, prospect_in: ProspectCreate, user_id: int) -> models.Prospect:
    db_prospect = models.Prospect(
        **prospect_in.model_dump(exclude={"contact_ids"}),
        user_id=user_id,
        status="Pendente",
        log=f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Campanha criada.\n"
    )
    db.add(db_prospect)
    await db.commit()
    await db.refresh(db_prospect)

    for contact_id in prospect_in.contact_ids:
        db_prospect_contact = models.ProspectContact(
            prospect_id=db_prospect.id,
            contact_id=contact_id,
            situacao="Aguardando Início",
            conversa="[]"
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

async def append_to_log(db: AsyncSession, prospect_id: int, message: str, new_status: str | None = None):
    prospect = await db.get(models.Prospect, prospect_id)
    if prospect:
        timestamp = datetime.now().strftime('%H:%M:%S')
        prospect.log += f"[{timestamp}] {message}\n"
        if new_status:
            prospect.status = new_status
        await db.commit()

async def get_prospect_contacts_by_status(db: AsyncSession, prospect_id: int, status: str):
    result = await db.execute(
        select(models.ProspectContact, models.Contact)
        .join(models.Contact)
        .where(
            models.ProspectContact.prospect_id == prospect_id,
            models.ProspectContact.situacao == status
        )
    )
    return result.all()
    
async def update_prospect_contact(db: AsyncSession, pc_id: int, situacao: str, conversa: str | None = None):
    prospect_contact = await db.get(models.ProspectContact, pc_id)
    if prospect_contact:
        prospect_contact.situacao = situacao
        if conversa is not None:
            prospect_contact.conversa = conversa
        await db.commit()

async def get_prospect_contacts_with_details(db: AsyncSession, prospect_id: int):
    result = await db.execute(
        select(models.ProspectContact, models.Contact)
        .join(models.Contact)
        .where(models.ProspectContact.prospect_id == prospect_id)
        .options(selectinload(models.ProspectContact.contact))
    )
    return result.all()

async def find_active_prospect_contact_by_number(db: AsyncSession, user_id: int, number: str) -> Optional[Tuple[models.Contact, models.ProspectContact, models.Prospect]]:
    """
    Encontra um contato pelo número de telefone em qualquer campanha do usuário,
    lidando de forma inteligente com a presença ou ausência do nono dígito.
    """
    clean_number = "".join(filter(str.isdigit, str(number)))

    # Gera as duas possíveis variações do número
    number_v1 = ""
    number_v2 = ""

    # Verifica se é um número de celular brasileiro (com código de país 55 e DDD)
    if clean_number.startswith("55") and len(clean_number) >= 12:
        prefix = clean_number[:4]  # 55 + DDD
        suffix = clean_number[5:]
        
        # Se o número tem 13 dígitos e o 9º dígito está presente
        if len(clean_number) == 13 and clean_number[4] == '9':
            number_v1 = clean_number          # Versão com o 9º dígito (Ex: 5545999861237)
            number_v2 = prefix + suffix       # Versão sem o 9º dígito (Ex: 554599861237)
        # Se o número tem 12 dígitos (veio sem o 9º dígito)
        elif len(clean_number) == 12:
            number_v1 = clean_number                # Versão sem o 9º dígito
            number_v2 = prefix + '9' + clean_number[4:] # Versão com o 9º dígito
    
    # Se não for um formato reconhecido, busca apenas o número limpo
    if not number_v1:
        number_v1 = clean_number

    result = await db.execute(
        select(models.Contact, models.ProspectContact, models.Prospect)
        .join(models.ProspectContact, models.Contact.id == models.ProspectContact.contact_id)
        .join(models.Prospect, models.Prospect.id == models.ProspectContact.prospect_id)
        .where(
            # Procura por QUALQUER UMA das duas variações do número
            models.Contact.whatsapp.in_([number_v1, number_v2]),
            models.Prospect.user_id == user_id,
        )
        .order_by(models.Prospect.created_at.desc())
    )
    return result.first()


