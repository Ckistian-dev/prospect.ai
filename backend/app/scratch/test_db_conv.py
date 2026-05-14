
import asyncpg
import asyncio
import json
import os

async def test():
    db_url = "postgresql://evolution_user:Cjs2025*@localhost:5436/evolution_db"
    
    try:
        conn = await asyncpg.connect(db_url)
        print(f"Connected to {db_url}")
        
        # Query conversation messages specifically
        rows = await conn.fetch('SELECT "key", "message", "messageType" FROM "Message" WHERE "messageType" = \'conversation\' LIMIT 5')
        
        results = []
        for r in rows:
            results.append({
                "key": json.loads(r["key"]) if isinstance(r["key"], str) else r["key"],
                "message": json.loads(r["message"]) if isinstance(r["message"], str) else r["message"],
                "messageType": r["messageType"]
            })
        print(json.dumps(results, indent=2))
        
        await conn.close()
    except Exception as e:
        print(f"Error: {e}")

asyncio.run(test())
