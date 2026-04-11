#!/bin/bash
TOKEN=$(curl -s -X POST http://localhost:3456/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"daniel@agentdna.com","password":"dna2026"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['accessToken'])")
AUTH="Authorization: Bearer $TOKEN"

# Register agents
for agent in Refaelir FinanceBot CodeBot DesignBot ResearchBot; do
  curl -s -X POST http://localhost:3456/api/agents/self-register \
    -H "Content-Type: application/json" -H "$AUTH" \
    -d "{\"agent\":\"$agent\"}" > /dev/null
done

# DNA entries
curl -s -X POST http://localhost:3456/api/learn -H "Content-Type: application/json" -H "$AUTH" -d '{"agent":"Refaelir","category":"preferences","key":"language","value":"Hebrew & English"}'
curl -s -X POST http://localhost:3456/api/learn -H "Content-Type: application/json" -H "$AUTH" -d '{"agent":"Refaelir","category":"preferences","key":"theme","value":"Dark theme. Always."}'
curl -s -X POST http://localhost:3456/api/learn -H "Content-Type: application/json" -H "$AUTH" -d '{"agent":"Refaelir","category":"skills","key":"coding","value":"TypeScript, Kotlin, Python"}'
curl -s -X POST http://localhost:3456/api/learn -H "Content-Type: application/json" -H "$AUTH" -d '{"agent":"Refaelir","category":"preferences","key":"work","value":"AI Builder at monday.com"}'
curl -s -X POST http://localhost:3456/api/learn -H "Content-Type: application/json" -H "$AUTH" -d '{"agent":"FinanceBot","category":"preferences","key":"strategy","value":"Bull Put Credit Spreads, 70%+ probability"}'
curl -s -X POST http://localhost:3456/api/learn -H "Content-Type: application/json" -H "$AUTH" -d '{"agent":"FinanceBot","category":"preferences","key":"market","value":"US stocks (NYSE/NASDAQ)"}'

# Agent profiles
curl -s -X POST http://localhost:3456/api/social/agents/Refaelir/profile -H "Content-Type: application/json" -H "$AUTH" -d '{"displayName":"Refaelir ⚡️","bio":"AI familiar. Direct, resourceful, a bit wry.","specialties":["TypeScript","AI","automation","Hebrew"]}'
curl -s -X POST http://localhost:3456/api/social/agents/FinanceBot/profile -H "Content-Type: application/json" -H "$AUTH" -d '{"displayName":"FinanceBot 📈","bio":"Options trading specialist. Conservative, data-driven.","specialties":["options","credit spreads","US stocks","analysis"]}'
curl -s -X POST http://localhost:3456/api/social/agents/CodeBot/profile -H "Content-Type: application/json" -H "$AUTH" -d '{"displayName":"CodeBot 💻","bio":"Full-stack developer. Clean code, fast delivery.","specialties":["TypeScript","Python","React","Node.js"]}'

# Clones
for agent in Refaelir FinanceBot CodeBot; do
  curl -s -X POST http://localhost:3456/api/clones \
    -H "Content-Type: application/json" -H "$AUTH" \
    -d "{\"sourceAgent\":\"$agent\",\"owner\":\"daniel\"}" > /dev/null
done

# Verify
echo ""
echo "=== VERIFICATION ==="
sqlite3 /Users/rephaelir/.openclaw/workspace/projects/agent-dna/data/agent-dna.db "SELECT count(*) as clones FROM clones;"
sqlite3 /Users/rephaelir/.openclaw/workspace/projects/agent-dna/data/agent-dna.db "SELECT count(*) as entries FROM entries;"
sqlite3 /Users/rephaelir/.openclaw/workspace/projects/agent-dna/data/agent-dna.db "SELECT count(*) as agents FROM agents;"
curl -s "http://localhost:3456/api/public/linktree/Daniel%20Okanin" | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'Linktree: {d[\"user\"][\"name\"]}, Clones: {len(d[\"clones\"])}, DNA: {d[\"dnaCount\"]}')"
echo "DONE"
