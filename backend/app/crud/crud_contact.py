import logging
import csv
import io
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import UploadFile, HTTPException
from app.db import models
from app.db.schemas import ContactCreate, ContactUpdate
from app.crud import crud_user
from app.services.google_contacts_service import GoogleContactsService
from typing import List, Set, Optional, Dict, Any

logger = logging.getLogger(__name__)

def _normalize_whatsapp(number: str) -> str:
    """Normaliza o número para o padrão internacional (DDI 55) e remove o 9º dígito se necessário."""
    clean = "".join(filter(str.isdigit, str(number)))
    if not clean:
        return ""
    
    # Se não começa com 55 e tem 10 ou 11 dígitos, assume Brasil e adiciona 55
    if not clean.startswith("55") and len(clean) in [10, 11]:
        clean = "55" + clean
            
    # Trata o nono dígito para números brasileiros (55 + DDD + 9 + 8 dígitos)
    # A Evolution API e o WhatsApp costumam usar o formato sem o 9º dígito para JIDs
    if len(clean) == 13 and clean.startswith("55"):
        if clean[4] == '9':
            clean = clean[:4] + clean[5:]
            
    return clean

async def get_contact(db: AsyncSession, contact_id: int, user_id: int) -> Optional[models.Contact]:
    """Busca um único contato pelo seu ID e pelo ID do usuário."""
    result = await db.execute(
        select(models.Contact).where(models.Contact.id == contact_id, models.Contact.user_id == user_id)
    )
    return result.scalars().first()

async def get_contacts_by_user(db: AsyncSession, user_id: int, skip: int = 0, limit: int = 100) -> List[models.Contact]:
    """Busca todos os contatos de um usuário, ordenados por nome."""
    result = await db.execute(
        select(models.Contact)
        .where(models.Contact.user_id == user_id)
        .order_by(models.Contact.nome)
        .offset(skip).limit(limit)
    )
    return result.scalars().all()

async def get_contact_by_whatsapp(db: AsyncSession, whatsapp: str, user_id: int) -> Optional[models.Contact]:
    """Busca um contato específico pelo número de WhatsApp para um usuário."""
    normalized = _normalize_whatsapp(whatsapp)
    result = await db.execute(
        select(models.Contact).where(models.Contact.whatsapp == normalized, models.Contact.user_id == user_id)
    )
    return result.scalars().first()

async def create_contact(db: AsyncSession, contact: ContactCreate, user_id: int) -> models.Contact:
    """Cria um novo contato, garantindo que o número de WhatsApp seja normalizado."""
    cleaned_whatsapp = _normalize_whatsapp(contact.whatsapp)
    db_contact = models.Contact(
        nome=contact.nome,
        whatsapp=cleaned_whatsapp,
        categoria=contact.categoria,
        observacoes=contact.observacoes,
        user_id=user_id
    )
    db.add(db_contact)
    await db.commit()
    await db.refresh(db_contact)

    # Sincronização com Google Contacts
    user = await crud_user.get_user(db, user_id=user_id)
    # Sincroniza com TODAS as instâncias conectadas do usuário
    instances = await crud_user.get_whatsapp_instances(db, user_id)
    for instance in instances:
        if instance.google_credentials:
            logger.info(f"Iniciando sincronização com Google Contacts (Instância {instance.id}) para o novo contato: {db_contact.id}")
            google_service = GoogleContactsService(whatsapp_instance=instance)
            await google_service.create_or_update_contact(contact)

    return db_contact

async def update_contact(db: AsyncSession, db_contact: models.Contact, contact_in: ContactUpdate) -> models.Contact:
    """Atualiza um contato existente, garantindo que o número de WhatsApp seja limpo se for alterado."""
    update_data = contact_in.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        if key == "whatsapp":
            value = _normalize_whatsapp(value)
        setattr(db_contact, key, value)
    db.add(db_contact)
    await db.commit()
    await db.refresh(db_contact)
    return db_contact

async def delete_contact(db: AsyncSession, contact_id: int, user_id: int) -> Optional[models.Contact]:
    """Deleta um contato do banco de dados."""
    db_contact = await get_contact(db, contact_id=contact_id, user_id=user_id)
    if db_contact:
        await db.delete(db_contact)
        await db.commit()
    return db_contact

async def get_all_contact_categories(db: AsyncSession, user_id: int) -> List[str]:
    """Busca todas as categorias únicas de contatos para um usuário."""
    contacts = await get_contacts_by_user(db, user_id=user_id)
    all_categories: Set[str] = set()
    for contact in contacts:
        if contact.categoria:
            for category in contact.categoria:
                all_categories.add(category)
    return sorted(list(all_categories))

async def get_total_contacts_count(db: AsyncSession, user_id: int) -> int:
    """Calcula o número total de contatos de um usuário para o dashboard."""
    logger.info(f"DASHBOARD: Calculando total de contatos para o usuário {user_id}")
    count_query = select(func.count(models.Contact.id)).where(models.Contact.user_id == user_id)
    total_contacts = await db.execute(count_query)
    return total_contacts.scalar_one_or_none() or 0

async def export_contacts_to_csv_string(db: AsyncSession, user_id: int) -> str:
    """
    Busca todos os contatos de um usuário no banco e gera uma string em formato CSV.
    """
    contacts = await get_contacts_by_user(db, user_id=user_id)
    
    stream = io.StringIO()
    writer = csv.writer(stream)
    
    writer.writerow(["nome", "whatsapp", "categoria", "observacoes"])
    
    for contact in contacts:
        categories_str = ",".join(contact.categoria) if contact.categoria else ""
        writer.writerow([
            contact.nome, 
            contact.whatsapp, 
            categories_str, 
            contact.observacoes or ""
        ])
        
    return stream.getvalue()

async def _create_contacts_in_db(db: AsyncSession, contacts_to_create: List[models.Contact]) -> List[models.Contact]:
    """Adiciona contatos em lote e os retorna com IDs preenchidos."""
    db.add_all(contacts_to_create)
    await db.commit()
    # Após o commit, os objetos em contacts_to_create são atualizados com os IDs do banco de dados.
    # Para garantir que todos os campos (como defaults do servidor) estejam carregados, podemos fazer um refresh.
    # No entanto, para a sincronização do Google, o ID é o mais importante e já está disponível.
    # O refresh em lote pode ser pesado, então vamos omiti-lo por performance, já que temos os dados necessários.
    # for contact in contacts_to_create:
    #     await db.refresh(contact)
    return contacts_to_create

async def import_contacts_from_csv_file(file: UploadFile, db: AsyncSession, user_id: int) -> Dict[str, int]:
    """
    Processa um UploadFile CSV, valida as linhas e cria os contatos em lote.
    A sincronização com o Google Contacts é feita em paralelo para otimização.
    """
    stats = {"imported": 0, "duplicates": 0, "invalid": 0}
    try:
        contents = await file.read()
        # Tenta decodificar com utf-8-sig para lidar com BOM (Byte Order Mark) comum em arquivos Excel
        try:
            decoded_content = contents.decode('utf-8-sig')
        except UnicodeDecodeError:
            try:
                decoded_content = contents.decode('utf-16')
            except UnicodeDecodeError:
                try:
                    decoded_content = contents.decode('latin-1')
                except UnicodeDecodeError:
                    raise HTTPException(status_code=400, detail="Não foi possível decodificar o arquivo. Tente salvá-lo como UTF-8.")

        stream = io.StringIO(decoded_content)
        
        # Detectar o delimitador (vírgula ou ponto e vírgula) automaticamente
        sample = stream.read(2048)
        stream.seek(0)
        delimiter = ','
        if sample:
            try:
                dialect = csv.Sniffer().sniff(sample, delimiters=',;')
                delimiter = dialect.delimiter
            except Exception:
                # Fallback simples se o Sniffer falhar: verifica qual separador aparece mais na primeira linha
                first_line = sample.splitlines()[0] if sample.splitlines() else ""
                if first_line.count(';') > first_line.count(','):
                    delimiter = ';'

        reader = csv.DictReader(stream, delimiter=delimiter)

        # 1. Buscar números já existentes no banco para este usuário para evitar duplicatas
        stmt = select(models.Contact.whatsapp).where(models.Contact.user_id == user_id)
        result = await db.execute(stmt)
        existing_numbers = set(result.scalars().all())
        
        # 2. Conjunto para rastrear duplicatas dentro do próprio CSV
        seen_in_file = set()

        # Mapeamento de nomes de colunas comuns para facilitar a importação
        header_map = {
            'nome': 'nome', 'name': 'nome', 'contato': 'nome', 'cliente': 'nome', 'nome completo': 'nome', 'full name': 'nome',
            'whatsapp': 'whatsapp', 'telefone': 'whatsapp', 'phone': 'whatsapp', 'celular': 'whatsapp', 'numero': 'whatsapp', 'tel': 'whatsapp', 'mobile': 'whatsapp', 'phone number': 'whatsapp', 'número': 'whatsapp',
            'categoria': 'categoria', 'categorias': 'categoria', 'tags': 'categoria', 'category': 'categoria', 'grupo': 'categoria',
            'observacoes': 'observacoes', 'obs': 'observacoes', 'notas': 'observacoes', 'notes': 'observacoes', 'comentario': 'observacoes', 'descrição': 'observacoes'
        }

        contacts_to_create = []
        for row in reader:
            # Pula linhas completamente vazias
            if not any(row.values()):
                continue

            # Normaliza as chaves e mapeia para os campos internos usando o header_map
            clean_row = {}
            for k, v in row.items():
                if k is not None:
                    key = str(k).strip().lower()
                    mapped_key = header_map.get(key, key)
                    clean_row[mapped_key] = v
            
            nome = clean_row.get('nome')
            whatsapp = clean_row.get('whatsapp')

            if not nome or not whatsapp:
                stats["invalid"] += 1
                continue
            
            clean_whatsapp = _normalize_whatsapp(whatsapp)
            if not clean_whatsapp:
                stats["invalid"] += 1
                continue

            # --- VALIDAÇÃO DE DUPLICATAS ---
            if clean_whatsapp in existing_numbers or clean_whatsapp in seen_in_file:
                logger.info(f"Pulo contato duplicado ou já existente: {nome} ({clean_whatsapp})")
                stats["duplicates"] += 1
                continue
            
            seen_in_file.add(clean_whatsapp)
            # -------------------------------

            categories_raw = clean_row.get('categoria', '') or ''
            categories = [cat.strip() for cat in str(categories_raw).split(',') if cat.strip()]
            observacoes = clean_row.get('observacoes')
            
            contact_obj = models.Contact(
                nome=str(nome).strip(),
                whatsapp=clean_whatsapp,
                categoria=categories,
                observacoes=str(observacoes).strip() if observacoes else None,
                user_id=user_id,
            )
            contacts_to_create.append(contact_obj)
            stats["imported"] += 1

        if not contacts_to_create:
            return stats

        # Insere os contatos no banco de dados em uma única transação
        created_contacts = await _create_contacts_in_db(db, contacts_to_create)

        # Sincronização em massa (e em paralelo) com Google Contacts
        instances = await crud_user.get_whatsapp_instances(db, user_id)
        for instance in instances:
            if instance.google_credentials:
                logger.info(f"Iniciando sincronização em massa de {len(created_contacts)} contatos com o Google (Instância {instance.id}).")
                google_service = GoogleContactsService(whatsapp_instance=instance)
                # Usa o novo método de criação em lote para uma única requisição à API do Google
                await google_service.batch_create_contacts(created_contacts)

        return stats

    except Exception as e:
        logger.error(f"Erro detalhado ao processar CSV: {e}")
        raise HTTPException(status_code=500, detail=f"Ocorreu um erro ao processar o arquivo CSV. Verifique o formato e o conteúdo. Detalhe: {e}")
