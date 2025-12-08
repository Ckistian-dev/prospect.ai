import asyncio
import json
import logging
from typing import Dict, List, Any, Optional
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import dependencies
from app.db.database import get_db
from app.db import models, schemas
from app.db.schemas import Prospect, ProspectCreate, ProspectUpdate, ProspectContactUpdate
from app.crud import crud_prospect, crud_config, crud_user
from app.services.whatsapp_service import WhatsAppService, get_whatsapp_service, MessageSendError
from app.services.gemini_service import GeminiService, get_gemini_service

logger = logging.getLogger(__name__)
router = APIRouter()

async def _process_raw_message(
    raw_msg: dict, 
    history_list_for_context: list,
    instance_name: str, 
    persona_config: models.Config,
    whatsapp_service: WhatsAppService, 
    gemini_service: GeminiService,
    db: AsyncSession,
    user: models.User
) -> Optional[Dict[str, Any]]:
    try:
        key = raw_msg.get("key", {})
        msg_content = raw_msg.get("message", {})
        msg_id = key.get("id")

        if not msg_content or not msg_id: return None
        role = "assistant" if key.get("fromMe") else "user"
        content = ""
        
        if msg_content.get("conversation") or msg_content.get("extendedTextMessage"):
            content = msg_content.get("conversation") or msg_content.get("extendedTextMessage", {}).get("text", "")
        
        elif msg_content.get("audioMessage") or msg_content.get("imageMessage") or msg_content.get("documentMessage"):
            media_data = await whatsapp_service.get_media_and_convert(instance_name, raw_msg)
            if media_data:
                # Passa o histórico apenas para análise de mídia, não para transcrição de áudio.
                history_for_analysis = history_list_for_context if 'audio' not in media_data['mime_type'] else None
                analysis = await gemini_service.transcribe_and_analyze_media(
                    media_data, persona_config, db, user, db_history=history_for_analysis
                )
                
                if 'audio' in media_data['mime_type']:
                    content = f"[Áudio transcrito]: {analysis}"
                else:
                    content = f"[Análise de Mídia]: {analysis}"
                    caption_text = ""
                    if msg_content.get("imageMessage"): caption_text = msg_content["imageMessage"].get("caption", "").strip()
                    elif msg_content.get("documentMessage"): caption_text = msg_content["documentMessage"].get("caption", "").strip()
                    if caption_text: content += f"\n[Legenda da Mídia]: {caption_text}"
            else:
                content = "[Falha ao processar mídia]"

        if content and content.strip(): return {"id": msg_id, "role": role, "content": content}
        return None
        
    except Exception as e:
        logger.error(f"Erro ao processar mensagem individual ID {msg_id}: {e}", exc_info=True)
        return None

async def _synchronize_and_process_history(
    db: AsyncSession, 
    prospect_contact: models.ProspectContact,
    user: models.User, 
    persona_config: models.Config,
    whatsapp_service: WhatsAppService,
    gemini_service: GeminiService
) -> List[Dict[str, Any]]:
    
    if not user.instance_id:
        logger.warning(f"Usuário {user.id} não possui um instance_id configurado. Não é possível buscar o histórico.")
        # Retorna o histórico do DB para não perder o que já existe
        return json.loads(prospect_contact.conversa) if prospect_contact.conversa else []

    logger.info(f"Iniciando sincronização de histórico para o contato de prospecção ID {prospect_contact.id}...")
    try:
        db_history = json.loads(prospect_contact.conversa) if prospect_contact.conversa else []
    except (json.JSONDecodeError, TypeError):
        db_history = []
    
    clean_db_history = [msg for msg in db_history if 'id' in msg and not str(msg['id']).startswith(('sent_', 'internal_'))]
    if len(db_history) > len(clean_db_history):
        logger.info(f"Removendo/reprocessando {len(db_history) - len(clean_db_history)} mensagens temporárias ou sem ID.")
    
    processed_message_ids = {msg['id'] for msg in clean_db_history}
    contact_details = await crud_prospect.get_contact_details_from_prospect_contact(db, prospect_contact.id)

    # CORREÇÃO: A rota findMessages da Evolution usa o NOME da instância, não o ID.
    raw_history_api = await whatsapp_service.fetch_chat_history(user.instance_name, contact_details.whatsapp, count=999)

    if not raw_history_api:
        logger.warning("Não foi possível buscar o histórico da API. Verifique a instância da Evolution API.")
        if len(db_history) > len(clean_db_history):
            await crud_prospect.update_prospect_contact_conversation(db, prospect_contact.id, json.dumps(clean_db_history))
            await db.commit()
        return clean_db_history

    newly_processed_messages = []
    for raw_msg in reversed(raw_history_api):
        # Adiciona uma verificação para garantir que a mensagem é um dicionário.
        # A API da Evolution pode retornar um JSON string em vez de um objeto.
        if isinstance(raw_msg, str):
            try:
                raw_msg = json.loads(raw_msg)
            except json.JSONDecodeError:
                logger.warning(f"Não foi possível decodificar a mensagem da API: {raw_msg}")
                continue
        msg_id = raw_msg.get("key", {}).get("id")
        if msg_id and msg_id not in processed_message_ids:
            # --- CORREÇÃO: Atualizar o contexto a cada iteração ---
            # O histórico de contexto (`current_context_history`) deve ser a soma do que já estava no banco
            # com as mensagens que acabaram de ser processadas NESTA sincronização.
            # Isso garante que, se houver dois áudios seguidos, a análise do segundo
            # já terá o texto transcrito do primeiro como contexto.
            current_context_history = clean_db_history + newly_processed_messages # A lista `newly_processed_messages` cresce a cada iteração.
            
            processed_msg = await _process_raw_message(
                raw_msg, current_context_history, user.instance_name, persona_config, whatsapp_service, gemini_service, db, user
            )
            if processed_msg: newly_processed_messages.append(processed_msg)
    
    if newly_processed_messages: # A condição `len(db_history) > len(clean_db_history)` é redundante se `newly_processed_messages` for a fonte da verdade.
        updated_history = clean_db_history + newly_processed_messages
        logger.info(f"Sincronização: {len(newly_processed_messages)} mensagens novas/corrigidas processadas.")
        await crud_prospect.update_prospect_contact_conversation(db, prospect_contact.id, json.dumps(updated_history))
        await db.commit()
        return updated_history
    else:
        logger.info(f"Sincronização concluída. Nenhuma alteração no histórico.")
        return clean_db_history

@router.get("/", response_model=List[Prospect], summary="Listar prospecções do usuário")
async def get_prospects(db: AsyncSession = Depends(get_db), current_user: models.User = Depends(dependencies.get_current_active_user)):
    return await crud_prospect.get_prospects_by_user(db, user_id=current_user.id)

@router.post("/", response_model=Prospect, status_code=201)
async def create_prospect(prospect_data: ProspectCreate, db: AsyncSession = Depends(get_db), current_user: models.User = Depends(dependencies.get_current_active_user)):
    return await crud_prospect.create_prospect(db, prospect_in=prospect_data, user_id=current_user.id)

@router.get("/{prospect_id}/activity-log", response_model=List[schemas.ProspectActivityLog], summary="Obter o log de atividades de uma prospecção")
async def get_prospect_activity_log(prospect_id: int, db: AsyncSession = Depends(get_db), current_user: models.User = Depends(dependencies.get_current_active_user)):
    prospect = await crud_prospect.get_prospect(db, prospect_id=prospect_id, user_id=current_user.id)
    if not prospect:
        raise HTTPException(status_code=404, detail="Prospecção não encontrada.")

    contacts_with_details = await crud_prospect.get_prospect_contacts_with_details(db, prospect_id=prospect_id)
    
    # Ordena pela data de atualização mais recente
    sorted_contacts = sorted(contacts_with_details, key=lambda item: item.ProspectContact.updated_at, reverse=True)

    activity_log = [
        schemas.ProspectActivityLog(
            prospect_contact_id=item.ProspectContact.id, # <-- CORREÇÃO: Adicionado o ID da relação
            contact_id=item.ProspectContact.contact_id, # <-- CORREÇÃO: Adicionado o ID do contato
            contact_name=item.Contact.nome,
            contact_whatsapp=item.Contact.whatsapp,
            situacao=item.ProspectContact.situacao,
            observacoes=item.ProspectContact.observacoes,
            updated_at=item.ProspectContact.updated_at,
            conversa=item.ProspectContact.conversa
        ) for item in sorted_contacts
    ]
    return activity_log

@router.post("/{prospect_id}/start", summary="Iniciar uma prospecção")
async def start_prospecting(prospect_id: int, background_tasks: BackgroundTasks, db: AsyncSession = Depends(get_db), current_user: models.User = Depends(dependencies.get_current_active_user)):
    prospect = await crud_prospect.get_prospect(db, prospect_id=prospect_id, user_id=current_user.id)
    if not prospect:
        raise HTTPException(status_code=404, detail="Prospecção não encontrada.")
    if prospect.status == "Em Andamento":
        raise HTTPException(status_code=409, detail="Esta prospecção já está em andamento.")
    
    await crud_prospect.update_prospect(db, db_prospect=prospect, prospect_in=ProspectUpdate(status="Em Andamento"))
    return {"message": "Campanha iniciada. O worker irá processá-la em breve."}

@router.post("/{prospect_id}/stop", summary="Parar uma prospecção")
async def stop_prospecting(prospect_id: int, db: AsyncSession = Depends(get_db), current_user: models.User = Depends(dependencies.get_current_active_user)):
    prospect = await crud_prospect.get_prospect(db, prospect_id=prospect_id, user_id=current_user.id)
    if not prospect:
        raise HTTPException(status_code=404, detail="Prospecção não encontrada.")
    
    # Altera para "Pausado" em vez de "Parado" para indicar que pode ser retomada.
    if prospect.status not in ["Em Andamento", "Falha"]:
        raise HTTPException(status_code=400, detail=f"A campanha não está ativa. Status atual: '{prospect.status}'.")
    
    prospect_update = ProspectUpdate(status="Pausado")
    await crud_prospect.update_prospect(db, db_prospect=prospect, prospect_in=prospect_update)
    return {"message": "Campanha pausada. O worker irá parar de processá-la."}

@router.put("/{prospect_id}", response_model=Prospect, summary="Atualizar uma prospecção")
async def edit_prospect(prospect_id: int, prospect_in: ProspectUpdate, db: AsyncSession = Depends(get_db), current_user: models.User = Depends(dependencies.get_current_active_user)):
    db_prospect = await crud_prospect.get_prospect(db, prospect_id=prospect_id, user_id=current_user.id)
    if not db_prospect:
        raise HTTPException(status_code=404, detail="Prospecção não encontrada.")
    if db_prospect.status == "Em Andamento":
        raise HTTPException(status_code=400, detail="Não é possível editar uma campanha em andamento. Pare-a primeiro.")
    
    updated_prospect = await crud_prospect.update_prospect_and_add_contacts(db, prospect=db_prospect, update_data=prospect_in)
    return updated_prospect

@router.delete("/{prospect_id}", summary="Excluir uma prospecção")
async def delete_prospect(prospect_id: int, db: AsyncSession = Depends(get_db), current_user: models.User = Depends(dependencies.get_current_active_user)):
    prospect = await crud_prospect.get_prospect(db, prospect_id=prospect_id, user_id=current_user.id)
    if not prospect:
        raise HTTPException(status_code=404, detail="Prospecção não encontrada.")

    if prospect.status == "Em Andamento":
        raise HTTPException(
            status_code=400, 
            detail="Não é possível excluir uma campanha que está em andamento. Pare a campanha primeiro."
        )

    await crud_prospect.delete_prospect(db, prospect_to_delete=prospect)
    
    return {"detail": "Campanha de prospecção excluída com sucesso."}

@router.get("/sheet/{prospect_id}", response_model=Dict[str, Any], summary="Obter dados de uma campanha")
async def get_prospecting_sheet_data(prospect_id: int, db: AsyncSession = Depends(get_db), current_user: models.User = Depends(dependencies.get_current_active_user)):
    prospect = await crud_prospect.get_prospect(db, prospect_id=prospect_id, user_id=current_user.id)
    if not prospect:
        raise HTTPException(status_code=404, detail="Campanha não encontrada.")
    
    contacts_data = await crud_prospect.get_prospect_contacts_with_details(db, prospect_id=prospect_id)
    headers = ["id", "nome", "whatsapp", "situacao", "observacoes", "conversa"]
    data_rows = []
    for item in contacts_data:
        data_rows.append({
            "id": item.ProspectContact.id, 
            "nome": item.Contact.nome, 
            "whatsapp": item.Contact.whatsapp, 
            "situacao": item.ProspectContact.situacao, 
            "observacoes": item.ProspectContact.observacoes, 
            "conversa": item.ProspectContact.conversa
        })
    return {"headers": headers, "data": data_rows, "prospect_name": prospect.nome_prospeccao}


@router.put("/contacts/{prospect_contact_id}", summary="Atualizar um contato em uma prospecção")
async def update_prospect_contact_details(
    prospect_contact_id: int, 
    contact_in: ProspectContactUpdate, 
    db: AsyncSession = Depends(get_db), 
    current_user: models.User = Depends(dependencies.get_current_active_user)
):
    db_prospect_contact = await crud_prospect.get_prospect_contact_by_id(db, prospect_contact_id=prospect_contact_id)
    
    if not db_prospect_contact:
        raise HTTPException(status_code=404, detail="Contato da prospecção não encontrado.")
    
    db_prospect = await crud_prospect.get_prospect(db, prospect_id=db_prospect_contact.prospect_id, user_id=current_user.id)
    if not db_prospect:
        raise HTTPException(status_code=403, detail="Acesso negado.")

    await crud_prospect.update_prospect_contact(
        db, 
        pc_id=prospect_contact_id, 
        situacao=contact_in.situacao, 
        observacoes=contact_in.observacoes
    )
    return {"detail": "Contato atualizado com sucesso."}


@router.delete("/contacts/{prospect_contact_id}", summary="Remover um contato de uma prospecção")
async def delete_prospect_contact_from_campaign(
    prospect_contact_id: int, 
    db: AsyncSession = Depends(get_db), 
    current_user: models.User = Depends(dependencies.get_current_active_user)
):
    db_prospect_contact = await crud_prospect.get_prospect_contact_by_id(db, prospect_contact_id=prospect_contact_id)
    
    if not db_prospect_contact:
        raise HTTPException(status_code=404, detail="Contato da prospecção não encontrado.")
        
    db_prospect = await crud_prospect.get_prospect(db, prospect_id=db_prospect_contact.prospect_id, user_id=current_user.id)
    if not db_prospect:
        raise HTTPException(status_code=403, detail="Acesso negado.")

    await crud_prospect.delete_prospect_contact(db, prospect_contact_to_delete=db_prospect_contact)
    return {"detail": "Contato removido da campanha com sucesso."}
