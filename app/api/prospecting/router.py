import asyncio
import json
import logging
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Dict, Any, Optional

from app.api import dependencies
from app.db.database import get_db, SessionLocal
from app.db import models
from app.db.schemas import Prospect, ProspectCreate, ProspectUpdate, ProspectLog
from app.crud import crud_prospect, crud_config, crud_user
from app.services.whatsapp_service import WhatsAppService, get_whatsapp_service
from app.services.gemini_service import GeminiService, get_gemini_service

logger = logging.getLogger(__name__)
router = APIRouter()
prospecting_status: Dict[int, str] = {}


async def prospecting_agent_task(
    prospect_id: int, 
    user_id: int
):
    """O agente inteligente de prospecção que opera com a nova ordem de prioridades."""
    prospecting_status[prospect_id] = "running"
    
    whatsapp_service = get_whatsapp_service()
    gemini_service = get_gemini_service()

    async def log(db: AsyncSession, message: str, status_update: str = None):
        await crud_prospect.append_to_log(db, prospect_id=prospect_id, message=message, new_status=status_update)

    try:
        async with SessionLocal() as db:
            await log(db, "-> Agente iniciado em modo de monitoramento contínuo.", status_update="Em Andamento")
            user = await crud_user.get_user(db, user_id=user_id)
            if not user or not user.instance_name:
                await log(db, "ERRO: Usuário ou nome da instância não encontrado.", "Falha")
                return

        while prospecting_status.get(prospect_id) == "running":
            action_taken = False
            async with SessionLocal() as db:
                try:
                    user = await crud_user.get_user(db, user_id=user_id)
                    prospect_details = await crud_prospect.get_prospect(db, prospect_id=prospect_id, user_id=user_id)
                    config = await crud_config.get_config(db, config_id=prospect_details.config_id, user_id=user_id)

                    # --- FRENTE 1: RESPONDER MENSAGENS (ALTA PRIORIDADE) ---
                    replies_to_process = await crud_prospect.get_prospect_contacts_by_status(db, prospect_id=prospect_id, status="Resposta Recebida")
                    if replies_to_process:
                        action_taken = True
                        await log(db, f"-> Detectadas {len(replies_to_process)} respostas. Processando...")
                        for contact_info in replies_to_process:
                            contact, prospect_contact = contact_info.Contact, contact_info.ProspectContact
                            
                            await log(db, f"   - Processando resposta de {contact.nome} (ID Contato Prospecção: {prospect_contact.id}).")
                            
                            try:
                                conversation_history_db = json.loads(prospect_contact.conversa)
                            except (json.JSONDecodeError, TypeError):
                                conversation_history_db = []

                            if not conversation_history_db:
                                await log(db, f"   - Histórico no DB para {contact.nome} está vazio ou inválido. Pulando.")
                                continue
                            
                            await log(db, f"   - Enviando histórico de {len(conversation_history_db)} mensagens do DB para a IA.")
                            ia_response = gemini_service.generate_reply_message(config, contact, conversation_history_db)
                            
                            message_to_send = ia_response.get("mensagem_para_enviar")
                            new_status = ia_response.get("nova_situacao", "Aguardando Resposta")
                            new_observation = ia_response.get("observacoes", "")
                            
                            if message_to_send:
                                success = await whatsapp_service.send_text_message(user.instance_name, contact.whatsapp, message_to_send)
                                if success:
                                    await log(db, f"   - Resposta enviada para {contact.nome}.")
                                    await crud_user.decrement_user_tokens(db, db_user=user)
                                else:
                                    await log(db, f"   - FALHA ao enviar resposta para {contact.nome}.")
                                    new_status = "Falha no Envio"
                            else:
                                await log(db, f"   - IA decidiu esperar antes de responder {contact.nome}.")

                            conversation_history_db.append({"role": "assistant", "content": message_to_send or "[Ação: Esperar]"})
                            
                            await crud_prospect.update_prospect_contact(
                                db, 
                                pc_id=prospect_contact.id, 
                                situacao=new_status, 
                                conversa=json.dumps(conversation_history_db),
                                observacoes=new_observation
                            )
                            await asyncio.sleep(20)

                    # --- FRENTE 2: INICIAR NOVAS CONVERSAS (MÉDIA PRIORIDADE) ---
                    if not action_taken:
                        pending_contacts = await crud_prospect.get_prospect_contacts_by_status(db, prospect_id=prospect_id, status="Aguardando Início")
                        if pending_contacts:
                            action_taken = True
                            contact_info = pending_contacts[0]
                            contact, prospect_contact = contact_info.Contact, contact_info.ProspectContact
                            await log(db, f"   - Nenhuma resposta pendente. Iniciando novo contato: {contact.nome}...")
                            
                            history_from_api = await whatsapp_service.get_conversation_history(user.instance_name, contact.whatsapp)
                            
                            ia_response = gemini_service.generate_initial_message(config, contact, history_from_api)
                            message_to_send = ia_response.get("mensagem_para_enviar")

                            if message_to_send:
                                success = await whatsapp_service.send_text_message(user.instance_name, contact.whatsapp, message_to_send)
                                if success:
                                    await log(db, f"   - Primeira mensagem enviada para {contact.nome}.")
                                    conversa_json = json.dumps([{"role": "assistant", "content": message_to_send}])
                                    await crud_prospect.update_prospect_contact(db, pc_id=prospect_contact.id, situacao="Aguardando Resposta", conversa=conversa_json)
                                    await crud_user.decrement_user_tokens(db, db_user=user)
                                else:
                                    await log(db, f"   - FALHA ao enviar primeira mensagem para {contact.nome}.")
                                    await crud_prospect.update_prospect_contact(db, pc_id=prospect_contact.id, situacao="Falha no Envio")
                            else:
                                await log(db, f"   - IA decidiu não iniciar conversa com {contact.nome}.")
                                await crud_prospect.update_prospect_contact(db, pc_id=prospect_contact.id, situacao="Cancelado pela IA")

                    # --- FRENTE 3: FAZER FOLLOW-UP (BAIXA PRIORIDADE) ---
                    if not action_taken:
                        followups = await crud_prospect.get_contacts_for_followup(db, prospect=prospect_details)
                        if followups:
                            action_taken = True
                            await log(db, f"-> {len(followups)} follow-ups pendentes. Processando...")
                            for contact_info in followups:
                                contact, pc = contact_info.Contact, contact_info.ProspectContact
                                await log(db, f"   - Preparando follow-up para {contact.nome}.")
                                history = json.loads(pc.conversa)
                                ia_resp = gemini_service.generate_followup_message(config, contact, history)
                                msg, status = ia_resp.get("mensagem_para_enviar"), ia_resp.get("nova_situacao", "Aguardando Resposta")
                                if msg:
                                    if await whatsapp_service.send_text_message(user.instance_name, contact.whatsapp, msg):
                                        await log(db, f"   - Follow-up enviado para {contact.nome}.")
                                        await crud_user.decrement_user_tokens(db, db_user=user)
                                        history.append({"role": "assistant", "content": msg})
                                        await crud_prospect.update_prospect_contact(db, pc_id=pc.id, situacao=status, conversa=json.dumps(history))
                                    else:
                                        await log(db, f"   - FALHA ao enviar follow-up para {contact.nome}.")
                                        await crud_prospect.update_prospect_contact(db, pc_id=pc.id, situacao="Falha no Envio")
                                else:
                                    await log(db, f"   - IA decidiu não fazer follow-up para {contact.nome}.")
                                await asyncio.sleep(20)

                    if not action_taken:
                        await log(db, "-> Nenhuma ação pendente no momento. Monitorando...")

                except Exception as e:
                    logger.error(f"ERRO no ciclo do agente (Prospect ID: {prospect_id}): {e}", exc_info=True)
                    await log(db, f"   - ERRO no ciclo: {e}")

            if action_taken:
                await asyncio.sleep(30)
            else:
                await asyncio.sleep(10)

    except Exception as e:
        logger.error(f"ERRO CRÍTICO NO AGENTE (Prospect ID: {prospect_id}): {e}", exc_info=True)
        async with SessionLocal() as db:
            await log(db, f"\n-> ERRO CRÍTICO E FINALIZAÇÃO: {e}", status_update="Falha")
    finally:
        if prospect_id in prospecting_status:
            del prospecting_status[prospect_id]
        async with SessionLocal() as db:
             await log(db, "-> Agente finalizado.")

# (Restante das rotas: get, create, get_log, start, stop, get_sheet_data permanecem iguais)
@router.get("/", response_model=List[Prospect], summary="Listar prospecções do usuário")
async def get_prospects(db: AsyncSession = Depends(get_db), current_user: models.User = Depends(dependencies.get_current_active_user)):
    return await crud_prospect.get_prospects_by_user(db, user_id=current_user.id)

@router.post("/", response_model=Prospect, status_code=201)
async def create_prospect(prospect_data: ProspectCreate, db: AsyncSession = Depends(get_db), current_user: models.User = Depends(dependencies.get_current_active_user)):
    return await crud_prospect.create_prospect(db, prospect_in=prospect_data, user_id=current_user.id)

@router.get("/{prospect_id}/log", response_model=ProspectLog, summary="Obter log de uma prospecção")
async def get_prospect_log(prospect_id: int, db: AsyncSession = Depends(get_db), current_user: models.User = Depends(dependencies.get_current_active_user)):
    prospect = await crud_prospect.get_prospect(db, prospect_id=prospect_id, user_id=current_user.id)
    if not prospect: raise HTTPException(status_code=404, detail="Prospecção não encontrada.")
    return prospect

@router.post("/{prospect_id}/start", summary="Iniciar uma prospecção")
async def start_prospecting(prospect_id: int, background_tasks: BackgroundTasks, db: AsyncSession = Depends(get_db), current_user: models.User = Depends(dependencies.get_current_active_user)):
    if prospect_id in prospecting_status and prospecting_status[prospect_id] == "running": raise HTTPException(status_code=409, detail="Esta prospecção já está em andamento.")
    prospect = await crud_prospect.get_prospect(db, prospect_id=prospect_id, user_id=current_user.id)
    if not prospect: raise HTTPException(status_code=404, detail="Prospecção não encontrada.")
    if prospect.status in ["Concluído", "Em Andamento"]: raise HTTPException(status_code=400, detail=f"A prospecção já está com o status '{prospect.status}' e não pode ser reiniciada/iniciada.")
    background_tasks.add_task(prospecting_agent_task, prospect_id, current_user.id)
    return {"message": "Agente de prospecção iniciado em segundo plano."}

@router.post("/{prospect_id}/stop", summary="Parar uma prospecção")
async def stop_prospecting(prospect_id: int, db: AsyncSession = Depends(get_db), current_user: models.User = Depends(dependencies.get_current_active_user)):
    prospect = await crud_prospect.get_prospect(db, prospect_id=prospect_id, user_id=current_user.id)
    if not prospect: raise HTTPException(status_code=404, detail="Prospecção não encontrada.")
    if prospect.status != "Em Andamento": raise HTTPException(status_code=400, detail=f"A campanha não está 'Em Andamento', seu status atual é '{prospect.status}'.")
    prospect_update = ProspectUpdate(status="Parado")
    await crud_prospect.update_prospect(db, db_prospect=prospect, prospect_in=prospect_update)
    if prospect_id in prospecting_status and prospecting_status[prospect_id] == "running": prospecting_status[prospect_id] = "stopping"
    return {"message": "Sinal de parada enviado. A prospecção foi interrompida e seu status atualizado."}

@router.get("/sheet/{prospect_id}", response_model=Dict[str, Any], summary="Obter dados de uma campanha")
async def get_prospecting_sheet_data(prospect_id: int, db: AsyncSession = Depends(get_db), current_user: models.User = Depends(dependencies.get_current_active_user)):
    prospect = await crud_prospect.get_prospect(db, prospect_id=prospect_id, user_id=current_user.id)
    if not prospect: raise HTTPException(status_code=404, detail="Campanha não encontrada.")
    contacts_data = await crud_prospect.get_prospect_contacts_with_details(db, prospect_id=prospect_id)
    headers = ["id", "nome", "whatsapp", "situacao", "observacoes", "conversa"]
    data_rows = []
    for item in contacts_data: data_rows.append({"id": item.Contact.id, "nome": item.Contact.nome, "whatsapp": item.Contact.whatsapp, "situacao": item.ProspectContact.situacao, "observacoes": item.ProspectContact.observacoes, "conversa": item.ProspectContact.conversa})
    return {"headers": headers, "data": data_rows, "prospect_name": prospect.nome_prospeccao}

