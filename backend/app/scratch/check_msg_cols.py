import asyncio
import os
import asyncpg
import json
from dotenv import load_dotenv

load_dotenv("backend/.env")

async def check_columns():
    url = os.getenv("EVOLUTION_DATABASE_URL")
    if not url:
        print("EVOLUTION_DATABASE_URL not found")
        return
    
    if "postgresql+asyncpg" in url:
        url = url.replace("postgresql+asyncpg", "postgresql")
    
    conn = await asyncpg.connect(url)
    try:
        rows = await conn.fetch("""
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'Message'
        """)
        for r in rows:
            print(f"Column: {r['column_name']}, Type: {r['data_type']}")
        
        instances = await conn.fetch("""
            SELECT DISTINCT "instanceId" 
            FROM "Message" 
            LIMIT 10
        """)
        print(f"Sample instanceIds in Message table: {[i['instanceId'] for i in instances]}")
        
        # Check some sample data for remoteJid
        sample = await conn.fetch("""
            SELECT "key"->>'remoteJid' as remoteJid, "key" 
            FROM "Message" 
            LIMIT 1
        """)
        if sample:
            print(f"Sample remoteJid: {sample[0]['remotejid']}")
            print(f"Sample key: {sample[0]['key']}")
            
    finally:
        await conn.close()

asyncio.run(check_columns())
