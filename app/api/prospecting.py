import asyncio
import json
import logging
import random
from typing import Dict, List, Any, Optional
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timezone, timedelta

from app.api import dependencies
from app.db.database import get_db, SessionLocal
from app.db import models
from app.db.schemas import Prospect, ProspectCreate, ProspectUpdate, ProspectLog, ProspectContactUpdate
from app.crud import crud_prospect, crud_config, crud_user
from app.services.whatsapp_service import WhatsAppService, get_whatsapp_service, MessageSendError
from app.services.gemini_service import GeminiService, get_gemini_service

logger = logging.getLogger(__name__)
router = APIRouter()
prospecting_status: Dict[int, bool] = {}

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
                analysis = await gemini_service.transcribe_and_analyze_media(
                    media_data, 
                    history_list_for_context,
                    persona_config,
                    db,
                    user
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
    # ... (código inalterado)
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
    raw_history_api = await whatsapp_service.fetch_chat_history(user.instance_name, contact_details.whatsapp, count=32)

    if not raw_history_api:
        logger.warning("Não foi possível buscar o histórico da API. Verifique a instância da Evolution API.")
        if len(db_history) > len(clean_db_history):
            await crud_prospect.update_prospect_contact_conversation(db, prospect_contact.id, json.dumps(clean_db_history))
            await db.commit()
        return clean_db_history

    newly_processed_messages = []
    for raw_msg in reversed(raw_history_api):
        msg_id = raw_msg.get("key", {}).get("id")
        if msg_id and msg_id not in processed_message_ids:
            current_context_history = clean_db_history + newly_processed_messages
            processed_msg = await _process_raw_message(
                raw_msg, current_context_history, user.instance_name, persona_config, whatsapp_service, gemini_service, db, user
            )
            if processed_msg: newly_processed_messages.append(processed_msg)
    
    if newly_processed_messages or len(db_history) > len(clean_db_history):
        updated_history = clean_db_history + newly_processed_messages
        logger.info(f"Sincronização: {len(newly_processed_messages)} mensagens novas/corrigidas processadas.")
        await crud_prospect.update_prospect_contact_conversation(db, prospect_contact.id, json.dumps(updated_history))
        await db.commit()
        return updated_history
    else:
        logger.info(f"Sincronização concluída. Nenhuma alteração no histórico.")
        return clean_db_history

async def prospecting_agent_task(prospect_id: int, user_id: int):
    logger.info(f"-> Agente de prospecção INICIADO para a campanha {prospect_id} do usuário {user_id}.")
    prospecting_status[prospect_id] = True
    whatsapp_service = get_whatsapp_service()
    gemini_service = get_gemini_service()
    
    last_initial_message_sent_at = datetime.now(timezone.utc) - timedelta(days=1)
    
    async def log(db: AsyncSession, message: str, status_update: str = None):
        await crud_prospect.append_to_log(db, prospect_id=prospect_id, message=message, new_status=status_update)
    
    await log(SessionLocal(), "-> Agente iniciado.", status_update="Em Andamento")

    while prospecting_status.get(prospect_id, False):
        action_taken = False
        try:
            async with SessionLocal() as db:
                user = await crud_user.get_user(db, user_id)
                if not user:
                    logger.warning(f"Agente (Prospect): Usuário {user_id} não encontrado. Parando o agente.")
                    await log(db, "ERRO: Usuário não encontrado. Finalizando agente.", status_update="Falha")
                    break

                prospect_campaign = await crud_prospect.get_prospect(db, prospect_id, user_id)
                if not prospect_campaign or prospect_campaign.status != "Em Andamento":
                     logger.info(f"Campanha {prospect_id} não está 'Em Andamento'. Parando o agente.")
                     await log(db, "-> Campanha parada ou não encontrada. Finalizando agente.")
                     break
                
                await log(db, "-> Buscando contatos para processar (Prioridade: Respostas > Follow-ups > Iniciais)...")
                
                contact_to_process = await crud_prospect.get_prospects_para_processar(db, prospect_campaign)
                if contact_to_process:
                    action_taken = True
                    pc, contact = contact_to_process
                    mode = "reply" if pc.situacao == "Resposta Recebida" else ("followup" if pc.situacao == "Aguardando Resposta" else "initial")
                    
                    # Envolve todo o processamento de um contato em um try/except para robustez
                    try:
                        if mode == 'initial':
                            interval_seconds = prospect_campaign.initial_message_interval_seconds
                            time_since_last = (datetime.now(timezone.utc) - last_initial_message_sent_at).total_seconds()
                            
                            if time_since_last < interval_seconds:
                                wait_time = interval_seconds - time_since_last
                                await log(db, f"-> Intervalo para novas conversas ativo. Aguardando aprox. {int(wait_time)}s.")
                                action_taken = False 
                                await asyncio.sleep(min(wait_time, 25))
                                continue
                            
                            await log(db, f"-> Verificando se '{contact.whatsapp}' é um número de WhatsApp válido...")
                            check_result = await whatsapp_service.check_whatsapp_numbers(user.instance_name, [contact.whatsapp])

                            if not check_result or not check_result[0].get("exists"):
                                await log(db, f"   - NÚMERO INVÁLIDO. '{contact.whatsapp}' não é uma conta de WhatsApp.")
                                await crud_prospect.update_prospect_contact(
                                    db, pc_id=pc.id, situacao="Sem Whatsapp", 
                                    observacoes="Número não registrado no WhatsApp."
                                )
                                await db.commit()
                                continue
                            else:
                                await log(db, f"   - Número válido. Prosseguindo.")

                        motivo_map = {'reply': 'Nova Resposta Recebida', 'followup': 'Tempo de Follow-up Atingido', 'initial': 'Início de Nova Conversa'}
                        await log(db, f"-> Contato selecionado: '{contact.nome}'. Motivo: {motivo_map.get(mode)}.")
                        
                        persona_config = await crud_config.get_config(db, config_id=prospect_campaign.config_id, user_id=user_id)
                        if not persona_config:
                            await log(db, f"ERRO: Persona não encontrada para o contato '{contact.nome}'. Pulando.", status_update="Em Andamento")
                            await crud_prospect.update_prospect_contact(db, pc.id, situacao="Erro: Persona não encontrada"); continue

                        await log(db, f"   - Sincronizando histórico de '{contact.nome}' com a API do WhatsApp...")
                        full_history = await _synchronize_and_process_history(db, pc, user, persona_config, whatsapp_service, gemini_service)
                        await log(db, f"   - Histórico sincronizado. Total de {len(full_history)} mensagens.")
                        
                        if mode == 'reply' and (not full_history or full_history[-1]['role'] != 'user'):
                            await log(db, f"   - Sincronização detectou que já respondemos '{contact.nome}'. Atualizando status.")
                            await crud_prospect.update_prospect_contact(db, pc.id, situacao="Aguardando Resposta"); await db.commit(); continue
                        
                        await log(db, f"   - Solicitando ação da IA (Modo: {mode})...")
                        
                        ia_response = await gemini_service.generate_conversation_action(
                            config=persona_config, contact=contact, conversation_history_db=full_history,
                            mode=mode, db=db, user=user
                        )

                        message_to_send = ia_response.get("mensagem_para_enviar")
                        new_status = ia_response.get("nova_situacao", "Aguardando Resposta")
                        new_observation = ia_response.get("observacoes", "")
                        
                        await log(db, f"   - Decisão da IA: Mudar status para '{new_status}'.")
                        if new_observation:
                            await log(db, f"   - Decisão da IA: Adicionar observação: '{new_observation}'.")

                        history_after_response = full_history.copy()
                        
                        if message_to_send:
                            message_parts = [part.strip() for part in message_to_send.split('\n\n') if part.strip()]
                            await log(db, f"   - Decisão da IA: Enviar {len(message_parts)} parte(s) de mensagem.")
                            
                            all_sent_successfully = True
                            for i, part in enumerate(message_parts):
                                part_sent = False
                                max_retries = 3
                                for attempt in range(max_retries):
                                    try:
                                        await whatsapp_service.send_text_message(user.instance_name, contact.whatsapp, part)
                                        part_sent = True
                                        await log(db, f"   - Mensagem {i+1}/{len(message_parts)} enviada para '{contact.nome}' (tentativa {attempt + 1}).")
                                        pending_id = f"sent_{datetime.now(timezone.utc).isoformat()}"
                                        history_after_response.append({"id": pending_id, "role": "assistant", "content": part})
                                        
                                        if i < len(message_parts) - 1:
                                            await asyncio.sleep(random.uniform(4, 10))
                                        
                                        break
                                    except MessageSendError as e:
                                        logger.error(f"Falha ao enviar parte {i+1} para '{contact.nome}' na tentativa {attempt + 1}/{max_retries}. Erro: {e}")
                                        if attempt < max_retries - 1:
                                            wait_time = 5 * (attempt + 2)
                                            await log(db, f"   - Tentando novamente em {wait_time} segundos...")
                                            await asyncio.sleep(wait_time)
                                        else:
                                            await log(db, f"   - FALHA CRÍTICA ao enviar mensagem {i+1}/{len(message_parts)} para '{contact.nome}' após {max_retries} tentativas.")
                                            new_status = "Falha no Envio"
                                            all_sent_successfully = False
                                
                                if not part_sent:
                                    break
                            
                            if mode == 'initial' and all_sent_successfully:
                                last_initial_message_sent_at = datetime.now(timezone.utc)
                        else:
                            await log(db, "   - Decisão da IA: Nenhuma mensagem a ser enviada neste momento.")
                            pending_id = f"internal_{datetime.now(timezone.utc).isoformat()}"
                            history_after_response.append({"id": pending_id, "role": "assistant", "content": f"[Ação Interna: Não responder - Modo: {mode}]"})

                        await crud_prospect.update_prospect_contact(
                            db, pc_id=pc.id, situacao=new_status,
                            conversa=json.dumps(history_after_response), observacoes=new_observation
                        )
                        await db.commit()
                        await log(db, f"-> Ação para '{contact.nome}' concluída.")
                    
                    except Exception as inner_e:
                        logger.error(f"ERRO INTERNO no processamento do contato {contact.nome}: {inner_e}", exc_info=True)
                        await log(db, f"ERRO ao processar contato '{contact.nome}': {inner_e}")
                        try:
                            await crud_prospect.update_prospect_contact(db, pc_id=pc.id, situacao="Erro IA", observacoes=str(inner_e))
                            await db.commit()
                        except Exception as update_err:
                            logger.error(f"Falha ao atualizar status de erro para contato {pc.id}: {update_err}")

                else:
                    await log(db, "-> Nenhuma ação pendente no momento. Monitorando...")
                    action_taken = False
                    
        except Exception as outer_e:
            logger.error(f"ERRO CRÍTICO no ciclo do agente (Prospect ID: {prospect_id}): {outer_e}", exc_info=True)
            await log(SessionLocal(), f"ERRO CRÍTICO no ciclo do agente: {outer_e}", status_update="Falha")
        
        if not action_taken:
            await asyncio.sleep(25)
        else:
            await asyncio.sleep(random.uniform(5, 15))

    if prospect_id in prospecting_status:
        del prospecting_status[prospect_id]
    logger.info(f"-> Agente de prospecção FINALIZADO para a campanha {prospect_id}.")
    async with SessionLocal() as db:
        prospect = await crud_prospect.get_prospect(db, prospect_id=prospect_id, user_id=user_id)
        if prospect and prospect.status == "Em Andamento":
            await log(db, "-> Agente finalizado inesperadamente.", status_update="Pausado")

# ... (Resto do arquivo com as rotas da API, sem alterações)
def start_agent_for_prospect(prospect_id: int, user_id: int, background_tasks: BackgroundTasks):
    if not prospecting_status.get(prospect_id, False):
        background_tasks.add_task(prospecting_agent_task, prospect_id, user_id)
    else:
        logger.warning(f"Tentativa de iniciar agente que já está rodando para a prospecção {prospect_id}.")

def stop_agent_for_prospect(prospect_id: int):
    if prospecting_status.get(prospect_id, False):
        prospecting_status[prospect_id] = False
        logger.info(f"Sinal de parada enviado para o agente da prospecção {prospect_id}.")
    else:
        logger.warning(f"Tentativa de parar agente que não está rodando para a prospecção {prospect_id}.")

@router.get("/", response_model=List[Prospect], summary="Listar prospecções do usuário")
async def get_prospects(db: AsyncSession = Depends(get_db), current_user: models.User = Depends(dependencies.get_current_active_user)):
    return await crud_prospect.get_prospects_by_user(db, user_id=current_user.id)

@router.post("/", response_model=Prospect, status_code=201)
async def create_prospect(prospect_data: ProspectCreate, db: AsyncSession = Depends(get_db), current_user: models.User = Depends(dependencies.get_current_active_user)):
    return await crud_prospect.create_prospect(db, prospect_in=prospect_data, user_id=current_user.id)

@router.get("/{prospect_id}/log", response_model=ProspectLog, summary="Obter log de uma prospecção")
async def get_prospect_log(prospect_id: int, db: AsyncSession = Depends(get_db), current_user: models.User = Depends(dependencies.get_current_active_user)):
    prospect = await crud_prospect.get_prospect(db, prospect_id=prospect_id, user_id=current_user.id)
    if not prospect:
        raise HTTPException(status_code=404, detail="Prospecção não encontrada.")
    return prospect

@router.post("/{prospect_id}/start", summary="Iniciar uma prospecção")
async def start_prospecting(prospect_id: int, background_tasks: BackgroundTasks, db: AsyncSession = Depends(get_db), current_user: models.User = Depends(dependencies.get_current_active_user)):
    if prospecting_status.get(prospect_id, False):
        raise HTTPException(status_code=409, detail="Esta prospecção já está em andamento.")
    prospect = await crud_prospect.get_prospect(db, prospect_id=prospect_id, user_id=current_user.id)
    if not prospect:
        raise HTTPException(status_code=404, detail="Prospecção não encontrada.")
    
    await crud_prospect.update_prospect(db, db_prospect=prospect, prospect_in=ProspectUpdate(status="Em Andamento"))
    
    start_agent_for_prospect(prospect_id, current_user.id, background_tasks)
    return {"message": "Agente de prospecção iniciado em segundo plano."}

@router.post("/{prospect_id}/stop", summary="Parar uma prospecção")
async def stop_prospecting(prospect_id: int, db: AsyncSession = Depends(get_db), current_user: models.User = Depends(dependencies.get_current_active_user)):
    prospect = await crud_prospect.get_prospect(db, prospect_id=prospect_id, user_id=current_user.id)
    if not prospect:
        raise HTTPException(status_code=404, detail="Prospecção não encontrada.")
    if prospect.status != "Em Andamento":
        raise HTTPException(status_code=400, detail=f"A campanha não está 'Em Andamento', seu status atual é '{prospect.status}'.")
    
    stop_agent_for_prospect(prospect_id)
    
    prospect_update = ProspectUpdate(status="Parado")
    await crud_prospect.update_prospect(db, db_prospect=prospect, prospect_in=prospect_update)
    
    return {"message": "Sinal de parada enviado. A prospecção foi interrompida e seu status atualizado."}

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

