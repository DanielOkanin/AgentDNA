# AgentDNA MCP Server

The AgentDNA MCP (Model Context Protocol) server exposes AgentDNA functionality as tools that can be used by AI assistants in Claude Desktop, OpenClaw, Cursor, and other MCP-compatible clients.

## Features

The MCP server provides direct access to the AgentDNA SQLite database (no HTTP server required) with the following tools:

- **dna_onboard** — Register an agent and get complete user profile
- **dna_learn** — Teach AgentDNA something new about the user
- **dna_recall** — Retrieve knowledge about the user
- **dna_profile** — Get full user profile organized by category
- **dna_agents** — List all registered agents
- **dna_stats** — Get system statistics

## Installation

1. Build the project:
```bash
npm run build
```

2. The MCP server will be available at `dist/mcp-server.js`

## Configuration

The MCP server supports the following environment variables:

- `AGENTDNA_DB_PATH` — Path to SQLite database (default: `data/agent-dna.db` relative to cwd)
- `AGENTDNA_AGENT` — Optional default agent name

## Usage

### Claude Desktop

Add to your Claude Desktop config file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`  
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "agentdna": {
      "command": "node",
      "args": ["/absolute/path/to/agent-dna/dist/mcp-server.js"],
      "env": {
        "AGENTDNA_DB_PATH": "/path/to/agent-dna.db"
      }
    }
  }
}
```

### OpenClaw

Add to your OpenClaw MCP config:

```json
{
  "mcpServers": {
    "agentdna": {
      "command": "node",
      "args": ["/Users/you/projects/agent-dna/dist/mcp-server.js"],
      "env": {
        "AGENTDNA_DB_PATH": "/Users/you/projects/agent-dna/data/agent-dna.db"
      }
    }
  }
}
```

### Cursor

Add to Cursor's MCP settings (`.cursor/mcp.json` or global settings):

```json
{
  "mcpServers": {
    "agentdna": {
      "command": "node",
      "args": ["/absolute/path/to/agent-dna/dist/mcp-server.js"]
    }
  }
}
```

### Cline (VSCode Extension)

Add to your Cline MCP settings:

```json
{
  "mcpServers": {
    "agentdna": {
      "command": "node",
      "args": ["/path/to/agent-dna/dist/mcp-server.js"],
      "env": {
        "AGENTDNA_DB_PATH": "/path/to/data/agent-dna.db"
      }
    }
  }
}
```

## Tool Examples

### dna_onboard
Register an agent and get everything known about the user:

```typescript
// Input
{
  "agent": "claude-assistant"
}

// Returns
{
  "agent": "claude-assistant",
  "categoryCount": 3,
  "totalEntries": 5,
  "profile": {
    "preferences": {
      "theme": { "value": "dark", "source": "claude-assistant", "confidence": 0.9 }
    },
    "skills": {
      "programming": { "value": ["TypeScript", "Python"], "source": "cursor", "confidence": 0.85 }
    }
  },
  "summary": "Welcome claude-assistant! Here's what I know about the user:\n..."
}
```

### dna_learn
Store new knowledge:

```typescript
// Input
{
  "agent": "claude-assistant",
  "category": "preferences",
  "key": "language",
  "value": "English",
  "confidence": 0.95,
  "visibility": "shared"
}

// Returns
{
  "success": true,
  "entry": {
    "id": "uuid-here",
    "category": "preferences",
    "key": "language",
    "value": "English",
    "source": "claude-assistant",
    "confidence": 0.95,
    "visibility": "shared",
    "timestamp": "2026-04-07T...",
    "updatedAt": "2026-04-07T..."
  }
}
```

### dna_recall
Retrieve knowledge:

```typescript
// Input - all entries
{ "agent": "claude-assistant" }

// Input - specific category
{ "agent": "claude-assistant", "category": "preferences" }

// Input - specific key
{ "agent": "claude-assistant", "category": "preferences", "key": "language" }

// Returns
{
  "agent": "claude-assistant",
  "filters": { "category": "preferences", "key": "language" },
  "count": 1,
  "entries": [...]
}
```

### dna_profile
Get organized profile:

```typescript
// Input
{ "agent": "claude-assistant" }

// Returns
{
  "agent": "claude-assistant",
  "categories": ["preferences", "habits", "skills"],
  "categoryCount": 3,
  "totalEntries": 12,
  "profile": {
    "preferences": { ... },
    "habits": { ... },
    "skills": { ... }
  }
}
```

### dna_agents
List all agents:

```typescript
// Input
{}

// Returns
{
  "count": 3,
  "agents": [
    { "name": "claude-assistant", "registeredAt": "2026-04-07T..." },
    { "name": "cursor", "registeredAt": "2026-04-06T..." }
  ]
}
```

### dna_stats
Get system stats:

```typescript
// Input
{}

// Returns
{
  "database": "/path/to/agent-dna.db",
  "entryCount": 42,
  "agentCount": 3,
  "categories": {
    "preferences": 15,
    "habits": 8,
    "skills": 12,
    "history": 5,
    "relationships": 2
  }
}
```

## Categories

AgentDNA organizes knowledge into five categories:

- **preferences** — User preferences, settings, likes/dislikes
- **habits** — Behavioral patterns, routines, tendencies
- **skills** — Abilities, expertise, knowledge domains
- **history** — Past events, experiences, interactions
- **relationships** — People, connections, social context

## Visibility Levels

Control who can see each piece of knowledge:

- **shared** (default) — Visible to all agents
- **private** — Only visible to the agent that created it
- **selective** — Visible only to specific agents (requires `visibleTo` array)

## Development

Run the MCP server directly for testing:

```bash
# Build first
npm run build

# Run with default settings
npm run mcp-server

# Run with custom database path
AGENTDNA_DB_PATH=/custom/path/db.sqlite npm run mcp-server
```

## Troubleshooting

### MCP server not appearing in client

1. Ensure the path to `mcp-server.js` is absolute
2. Check that the file has execute permissions
3. Verify Node.js is in your PATH
4. Check client logs for connection errors

### Database errors

1. Verify `AGENTDNA_DB_PATH` points to a valid location
2. Ensure the directory exists and is writable
3. Check file permissions on the database file

### Testing the server

You can test the MCP server using the MCP inspector:

```bash
npx @modelcontextprotocol/inspector node dist/mcp-server.js
```

This will open a web interface where you can test all the tools interactively.
