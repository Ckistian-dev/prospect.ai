import asyncio
import sys
from app.services.whatsapp_service import WhatsAppService
from app.core.config import settings
import logging

logging.basicConfig(level=logging.DEBUG)

async def test():
    try:
        ws = WhatsAppService()
        import asyncpg
        db_url = settings.EVOLUTION_DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://")
        print(f"Connecting to {db_url}...")
        conn = await asyncpg.connect(db_url)
        instance_id = await conn.fetchval('SELECT id FROM "Instance" LIMIT 1')
        await conn.close()
        
        print(f"Instance ID: {instance_id}")
        chats = await ws._fetch_chats_postgresql(instance_id, 5)
        print(f"Chats: {len(chats)}")
        import json
        for c in chats:
            print(f"JID: {c['remoteJid']}, LastMsg: {c['lastMessage']}, TS: {c['timestamp']}")
    except Exception as e:
        print(f"Error: {e}")

asyncio.run(test())
