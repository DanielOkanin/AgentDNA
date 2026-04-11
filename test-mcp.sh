#!/bin/bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}' | AGENTDNA_DB_PATH=/Users/rephaelir/.openclaw/workspace/projects/agent-dna/data/agent-dna.db node /Users/rephaelir/.openclaw/workspace/projects/agent-dna/dist/mcp-server.js 2>/tmp/mcp-err.log
echo "---STDERR---"
cat /tmp/mcp-err.log
