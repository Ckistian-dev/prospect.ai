from sqlalchemy import select
# --- CORREÇÃO: Importado 'joinedload' ---
from sqlalchemy.orm import joinedload 
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

# --- FUNÇÃO CORRIGIDA ---
async def get_prospects_by_user(db: AsyncSession, user_id: int) -> List[models.Prospect]:
    """
    Busca todas as prospecções de um usuário, carregando os contatos relacionados
    de forma antecipada (eager loading) usando um JOIN para evitar erros de lazy-loading.
    """
    result = await db.execute(
        select(models.Prospect)
        .where(models.Prospect.user_id == user_id)
        .options(joinedload(models.Prospect.contacts)) # Força um JOIN para buscar tudo de uma vez
        .order_by(models.Prospect.created_at.desc())
    )
    # .unique() é necessário com joinedload para evitar duplicatas do objeto Prospect
    return result.scalars().unique().all()

async def create_prospect(db: AsyncSession, prospect_in: ProspectCreate, user_id: int) -> models.Prospect:
    """
    Cria uma nova prospecção e associa os contatos a ela,
    inicializando o campo 'observacoes' para cada um.
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

    for contact_id in prospect_in.contact_ids:
        db_prospect_contact = models.ProspectContact(
            prospect_id=db_prospect.id,
            contact_id=contact_id,
            situacao="Aguardando Início",
            conversa="[]",
            # --- CAMPO ADICIONADO ---
            observacoes="" # Garante que o campo seja inicializado como uma string vazia.
        )
        db.add(db_prospect_contact)
    
    await db.commit()
    await db.refresh(db_prospect)
    return db_prospect

async def update_prospect(db: AsyncSession, *, db_prospect: models.Prospect, prospect_in: ProspectUpdate) -> models.Prospect:
    """
    Atualiza os dados de uma prospecção (ex: nome, status).
    Esta função não altera os contatos associados.
    """
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
    
async def update_prospect_contact(
    db: AsyncSession, 
    pc_id: int, 
    situacao: str, 
    conversa: str | None = None,
    observacoes: str | None = None
):
    """
    Atualiza os dados de um contato dentro de uma prospecção.
    """
    prospect_contact = await db.get(models.ProspectContact, pc_id)
    if prospect_contact:
        prospect_contact.situacao = situacao
        if conversa is not None:
            prospect_contact.conversa = conversa
        if observacoes is not None:
            # Anexa a nova observação à existente, com um timestamp.
            timestamp = datetime.now().strftime('%d/%m %H:%M')
            nova_observacao_formatada = f"[{timestamp}] {observacoes}"
            
            if prospect_contact.observacoes:
                prospect_contact.observacoes += f"\n{nova_observacao_formatada}"
            else:
                prospect_contact.observacoes = nova_observacao_formatada
                
        await db.commit()

async def get_prospect_contacts_with_details(db: AsyncSession, prospect_id: int):
    result = await db.execute(
        select(models.ProspectContact, models.Contact)
        .join(models.Contact)
        .where(models.ProspectContact.prospect_id == prospect_id)
        .options(joinedload(models.ProspectContact.contact))
    )
    return result.all()

async def find_active_prospect_contact_by_number(db: AsyncSession, user_id: int, number: str) -> Optional[Tuple[models.Contact, models.ProspectContact, models.Prospect]]:
    clean_number = "".join(filter(str.isdigit, str(number)))
    number_v1, number_v2 = "", ""

    if clean_number.startswith("55") and len(clean_number) >= 12:
        prefix = clean_number[:4]
        if len(clean_number) == 13 and clean_number[4] == '9':
            number_v1 = clean_number
            number_v2 = prefix + clean_number[5:]
        elif len(clean_number) == 12:
            number_v1 = clean_number
            number_v2 = f"{prefix}9{clean_number[4:]}"
    
    if not number_v1:
        number_v1 = clean_number

    result = await db.execute(
        select(models.Contact, models.ProspectContact, models.Prospect)
        .join(models.ProspectContact, models.Contact.id == models.ProspectContact.contact_id)
        .join(models.Prospect, models.Prospect.id == models.ProspectContact.prospect_id)
        .where(
            models.Contact.whatsapp.in_([number_v1, number_v2]),
            models.Prospect.user_id == user_id
        )
        .order_by(models.Prospect.created_at.desc())
    )
    return result.first()

