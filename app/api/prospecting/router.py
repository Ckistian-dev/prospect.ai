import asyncio
import json
import logging
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Dict, Any, Optional
import random
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

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


async def prospecting_agent_task(prospect_id: int, user_id: int):
    """O agente inteligente de prospecção com lógica de tempo não-bloqueante para máxima responsividade."""
    prospecting_status[prospect_id] = "running"
    
    whatsapp_service = get_whatsapp_service()
    gemini_service = get_gemini_service()

    # --- MUDANÇA 1: Controle de tempo para novas mensagens ---
    # Inicia permitindo que a primeira mensagem seja enviada imediatamente.
    next_initial_message_allowed_at = datetime.utcnow()

    async def log(db: AsyncSession, message: str, status_update: str = None):
        await crud_prospect.append_to_log(db, prospect_id=prospect_id, message=message, new_status=status_update)

    # A função process_contact_action permanece a mesma que na versão anterior
    async def process_contact_action(db: AsyncSession, contact_info, mode: str):
        """Função auxiliar para processar uma ação para um contato."""
        contact, prospect_contact = contact_info.Contact, contact_info.ProspectContact
        prospect_details = await crud_prospect.get_prospect(db, prospect_id=prospect_id, user_id=user_id)
        user = await crud_user.get_user(db, user_id=user_id)
        config = await crud_config.get_config(db, config_id=prospect_details.config_id, user_id=user_id)
        
        await log(db, f"   - Preparando ação '{mode}' para {contact.nome}.")
        
        try:
            history = json.loads(prospect_contact.conversa) if prospect_contact.conversa else []
        except json.JSONDecodeError:
            history = []

        ia_response = gemini_service.generate_conversation_action(config, contact, history, mode)
        
        message_to_send = ia_response.get("mensagem_para_enviar")
        new_status = ia_response.get("nova_situacao", "Aguardando Resposta")
        new_observation = ia_response.get("observacoes", "")
        
        if message_to_send:
            success = await whatsapp_service.send_text_message(user.instance_name, contact.whatsapp, message_to_send)
            if success:
                await log(db, f"   - Mensagem ({mode}) enviada para {contact.nome}.")
                history.append({"role": "assistant", "content": message_to_send})
                await crud_user.decrement_user_tokens(db, db_user=user)
            else:
                await log(db, f"   - FALHA ao enviar mensagem ({mode}) para {contact.nome}.")
                new_status = "Falha no Envio"
        else:
            await log(db, f"   - IA decidiu esperar (ação: {mode}) para {contact.nome}.")
            history.append({"role": "assistant", "content": f"[Ação Interna: Esperar - Modo: {mode}]"})

        await crud_prospect.update_prospect_contact(
            db, pc_id=prospect_contact.id, situacao=new_status,
            conversa=json.dumps(history), observacoes=new_observation
        )
        
        await log(db, f"   - Pausa de 5 segundos após ação em {contact.nome}.")
        await asyncio.sleep(5)

    try:
        async with SessionLocal() as db:
            await log(db, "-> Agente iniciado.", status_update="Em Andamento")
            initial_prospect = await crud_prospect.get_prospect(db, prospect_id=prospect_id, user_id=user_id)
            if not initial_prospect:
                await log(db, "ERRO: Prospecção não encontrada.", "Falha")
                return

        while prospecting_status.get(prospect_id) == "running":
            action_taken = False
            async with SessionLocal() as db:
                try:
                    # FRENTE 1: RESPONDER MENSAGENS (ALTA PRIORIDADE)
                    replies_to_process = await crud_prospect.get_prospect_contacts_by_status(db, prospect_id=prospect_id, status="Resposta Recebida")
                    if replies_to_process:
                        action_taken = True
                        await log(db, f"-> Prioridade alta: 1 de {len(replies_to_process)} respostas para processar...")
                        await process_contact_action(db, replies_to_process[0], 'reply')
                        continue 

                    # FRENTE 2: FAZER FOLLOW-UP (MÉDIA PRIORIDADE)
                    prospect_details = await crud_prospect.get_prospect(db, prospect_id=prospect_id, user_id=user_id)
                    followups = await crud_prospect.get_contacts_for_followup(db, prospect=prospect_details)
                    if followups:
                        action_taken = True
                        await log(db, f"-> Prioridade média: 1 de {len(followups)} follow-ups para processar...")
                        await process_contact_action(db, followups[0], 'followup')
                        continue

                    # --- MUDANÇA 2: LÓGICA DE VERIFICAÇÃO DE TEMPO ---
                    # FRENTE 3: INICIAR NOVAS CONVERSAS (BAIXA PRIORIDADE)
                    # Só executa se o tempo de "descanso" para novas mensagens já tiver passado.
                    if datetime.utcnow() >= next_initial_message_allowed_at:
                        pending_contacts = await crud_prospect.get_prospect_contacts_by_status(db, prospect_id=prospect_id, status="Aguardando Início")
                        if pending_contacts:
                            action_taken = True
                            await log(db, "-> Baixa prioridade: Iniciando 1 nova conversa...")
                            await process_contact_action(db, pending_contacts[0], 'initial')

                            # --- MUDANÇA 3: ATUALIZA O PRÓXIMO HORÁRIO PERMITIDO ---
                            random_delay_seconds = random.randint(45, 120)
                            # A lógica interna continua usando UTC, que é a melhor prática
                            next_initial_message_allowed_at = datetime.utcnow() + timedelta(seconds=random_delay_seconds)

                            # --- CORREÇÃO DE FUSO HORÁRIO APENAS PARA O LOG ---
                            # Pega o próximo horário permitido em UTC e o converte para o fuso horário de São Paulo (BRT)
                            try:
                                utc_time = datetime.utcnow() + timedelta(seconds=random_delay_seconds)
                                # Define explicitamente que o tempo é UTC
                                aware_utc_time = utc_time.replace(tzinfo=ZoneInfo("UTC"))
                                # Converte para o fuso local
                                local_time = aware_utc_time.astimezone(ZoneInfo("America/Sao_Paulo"))
                                next_time_str = local_time.strftime('%H:%M:%S')
                            except Exception:
                                # Fallback caso zoneinfo não esteja disponível, mostrando UTC para evitar erro
                                next_time_str = (datetime.utcnow() + timedelta(seconds=random_delay_seconds)).strftime('%H:%M:%S') + " (UTC)"
                            # --- FIM DA CORREÇÃO ---

                            await log(db, f"-> Nova mensagem enviada. Próxima tentativa de envio permitida após as {next_time_str} (em {random_delay_seconds}s).")
                            continue
                    
                    if not action_taken:
                        # Loga apenas se nenhuma ação foi tomada e o tempo de envio não chegou
                        if datetime.utcnow() < next_initial_message_allowed_at:
                             await log(db, f"-> Nenhuma ação prioritária. Aguardando intervalo para novas mensagens...")
                        else:
                             await log(db, "-> Nenhuma ação pendente. Monitorando...")

                except Exception as e:
                    logger.error(f"ERRO no ciclo do agente (Prospect ID: {prospect_id}): {e}", exc_info=True)
                    await log(db, f"   - ERRO no ciclo: {e}")
            
            # --- MUDANÇA 4: SLEEP CURTO E CONSTANTE ---
            # Pausa padrão e curta do ciclo para manter a responsividade a respostas.
            await asyncio.sleep(15)

    except Exception as e:
        logger.error(f"ERRO CRÍTICO NO AGENTE (Prospect ID: {prospect_id}): {e}", exc_info=True)
        async with SessionLocal() as db:
            await log(db, f"-> ERRO CRÍTICO E FINALIZAÇÃO: {e}", status_update="Falha")
    finally:
        if prospect_id in prospecting_status:
            del prospecting_status[prospect_id]
        async with SessionLocal() as db:
            prospect = await crud_prospect.get_prospect(db, prospect_id=prospect_id, user_id=user_id)
            if prospect and prospect.status not in ["Parado", "Falha"]:
                 await log(db, "-> Agente finalizado.")
            else:
                 await log(db, "-> Agente finalizado conforme solicitado ou por falha.")

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

# --- NOVO ENDPOINT ADICIONADO AQUI ---
@router.delete("/{prospect_id}", summary="Excluir uma prospecção")
async def delete_prospect(prospect_id: int, db: AsyncSession = Depends(get_db), current_user: models.User = Depends(dependencies.get_current_active_user)):
    """
    Exclui uma campanha de prospecção.
    Impede a exclusão se a campanha estiver em andamento.
    """
    prospect = await crud_prospect.get_prospect(db, prospect_id=prospect_id, user_id=current_user.id)
    if not prospect:
        raise HTTPException(status_code=404, detail="Prospecção não encontrada.")

    # Regra de segurança: não permitir exclusão de campanhas em andamento
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
    if not prospect: raise HTTPException(status_code=404, detail="Campanha não encontrada.")
    contacts_data = await crud_prospect.get_prospect_contacts_with_details(db, prospect_id=prospect_id)
    headers = ["id", "nome", "whatsapp", "situacao", "observacoes", "conversa"]
    data_rows = []
    for item in contacts_data: data_rows.append({"id": item.Contact.id, "nome": item.Contact.nome, "whatsapp": item.Contact.whatsapp, "situacao": item.ProspectContact.situacao, "observacoes": item.ProspectContact.observacoes, "conversa": item.ProspectContact.conversa})
    return {"headers": headers, "data": data_rows, "prospect_name": prospect.nome_prospeccao}

