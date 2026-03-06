from fastapi import APIRouter, Depends, HTTPException, Body
from typing import Dict, Any, List
import logging
import asyncio

from app.services.whatsapp_service import WhatsAppService, get_whatsapp_service
from app.api import dependencies
from app.db import models

logger = logging.getLogger(__name__)
router = APIRouter()

# Nome fixo da instância para esta integração
ATENDAI_INSTANCE_NAME = "atendai_integration"

async def ensure_atendai_instance():
    """
    Garante que a instância da Evolution API para o AtendAI exista no startup.
    """
    ws = get_whatsapp_service()
    try:
        status = await ws.get_connection_status(ATENDAI_INSTANCE_NAME)
        if status.get("status") != "connected":
            logger.info(f"Agente AtendAI: Criando instância '{ATENDAI_INSTANCE_NAME}'...")
            await ws.create_and_connect_instance(ATENDAI_INSTANCE_NAME)
        else:
            logger.info(f"Agente AtendAI: Instância '{ATENDAI_INSTANCE_NAME}' verificada. Status: {status.get('status')}")
    except Exception as e:
        logger.error(f"Erro ao inicializar instância AtendAI: {e}")

@router.get("/destinations", summary="Listar contatos e grupos para seleção")
async def list_atendai_destinations(
    whatsapp_service: WhatsAppService = Depends(get_whatsapp_service),
    current_user: models.User = Depends(dependencies.get_current_active_user)
):
    """
    Retorna a lista de contatos e grupos. Se a instância não estiver conectada,
    tenta gerar/retornar o QR Code para login na interface.
    """
    status = await whatsapp_service.get_connection_status(ATENDAI_INSTANCE_NAME)
    
    if status.get("status") != "connected":
        # Tenta obter o QR Code se não estiver conectado para permitir login via interface
        res = await whatsapp_service.create_and_connect_instance(ATENDAI_INSTANCE_NAME)
        return {
            "status": "disconnected",
            "qrcode": res.get("instance", {}).get("qrcode") if res.get("status") == "qrcode" else None,
            "message": "Instância desconectada. Escaneie o QR Code para continuar."
        }

    # Busca contatos e grupos em paralelo para melhor performance
    contacts_task = whatsapp_service.find_contacts(ATENDAI_INSTANCE_NAME)
    groups_task = whatsapp_service.fetch_all_groups(ATENDAI_INSTANCE_NAME)
    
    # Executa as buscas e captura possíveis erros ou retornos vazios
    contacts_res, groups_res = await asyncio.gather(contacts_task, groups_task, return_exceptions=True)
    
    contacts = contacts_res if isinstance(contacts_res, list) else []
    groups = groups_res if isinstance(groups_res, list) else []
    
    destinations = []
    
    # Mapeamento de contatos (Evolution findContacts retorna remoteJid como identificador real)
    for c in contacts:
        jid = c.get("remoteJid")
        if jid:
            destinations.append({
                "id": jid,
                "remoteJid": jid,
                "name": c.get("pushName") or c.get("name") or jid.split("@")[0],
                "type": "contact"
            })
            
    # Mapeamento de grupos (Evolution fetchAllGroups retorna id como identificador real)
    for g in groups:
        jid = g.get("id")
        if jid:
            destinations.append({
                "id": jid,
                "remoteJid": jid,
                "name": g.get("subject") or "Grupo sem nome",
                "type": "group"
            })
            
    return {"status": "connected", "destinations": destinations}

@router.post("/send", summary="Enviar mensagem para destino selecionado")
async def send_atendai_message(
    payload: Dict[str, Any] = Body(...),
    whatsapp_service: WhatsAppService = Depends(get_whatsapp_service),
    current_user: models.User = Depends(dependencies.get_current_active_user)
):
    """
    Envia uma mensagem de texto para o JID (contato ou grupo) fornecido.
    """
    remote_jid = payload.get("remoteJid")
    text = payload.get("text")

    if not remote_jid or not text:
        raise HTTPException(status_code=400, detail="remoteJid e text são obrigatórios.")

    # Verifica status e força recriação se necessário
    status = await whatsapp_service.get_connection_status(ATENDAI_INSTANCE_NAME)
    if status.get("status") != "connected":
        res = await whatsapp_service.create_and_connect_instance(ATENDAI_INSTANCE_NAME)
        return {
            "status": "disconnected",
            "qrcode": res.get("instance", {}).get("qrcode") if res.get("status") == "qrcode" else None,
            "message": "Instância desconectada. Recriação forçada iniciada. Escaneie o QR Code para continuar."
        }

    try:
        result = await whatsapp_service.send_text_message(ATENDAI_INSTANCE_NAME, remote_jid, text)
        return {"status": "success", "data": result}
    except Exception as e:
        logger.error(f"Falha ao enviar mensagem via AtendAI: {e}")
        raise HTTPException(status_code=500, detail=f"Erro no envio: {str(e)}")

@router.post("/whatsapp-numbers", summary="Verificar se números estão no WhatsApp")
async def check_atendai_numbers(
    payload: Dict[str, Any] = Body(...),
    whatsapp_service: WhatsAppService = Depends(get_whatsapp_service),
    current_user: models.User = Depends(dependencies.get_current_active_user)
):
    """
    Verifica se uma lista de números possui conta no WhatsApp usando a instância do AtendAI.
    """
    # Verifica status e força recriação se necessário
    conn_status = await whatsapp_service.get_connection_status(ATENDAI_INSTANCE_NAME)
    if conn_status.get("status") != "connected":
        res = await whatsapp_service.create_and_connect_instance(ATENDAI_INSTANCE_NAME)
        return {
            "status": "disconnected",
            "qrcode": res.get("instance", {}).get("qrcode") if res.get("status") == "qrcode" else None,
            "message": "Instância desconectada. Recriação forçada iniciada. Escaneie o QR Code para continuar."
        }

    numbers = payload.get("numbers")
    if not numbers or not isinstance(numbers, list):
        raise HTTPException(status_code=400, detail="O campo 'numbers' deve ser uma lista de strings.")

    try:
        result = await whatsapp_service.check_whatsapp_numbers(ATENDAI_INSTANCE_NAME, numbers)
        if result is None:
            raise HTTPException(status_code=500, detail="Erro ao verificar números na API.")
        return result
    except Exception as e:
        logger.error(f"Falha ao verificar números via AtendAI: {e}")
        raise HTTPException(status_code=500, detail=f"Erro na verificação: {str(e)}")