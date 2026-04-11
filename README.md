# 🧬 AgentDNA

**Your agents should already know you.**

AgentDNA is a shared knowledge layer for AI agents. Instead of briefing every new agent from scratch, they all read from and write to your DNA — a living profile that grows with every interaction.

## The Problem

You use 5 AI agents. Each one asks "who are you?" every single time. They don't talk to each other. They don't remember. You re-brief endlessly.

## The Solution

```
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│  FinanceBot  │  │   CodeBot   │  │   LifeBot   │
│  "user is    │  │  "user      │  │  (just      │
│  conservative│  │  codes in   │  │  joined!)   │
│  70%+ prob"  │  │  Kotlin"    │  │             │
└──────┬───────┘  └──────┬──────┘  └──────┬──────┘
       │ learn()         │ learn()        │ onboard()
       ▼                 ▼                ▼
  ╔═══════════════════════════════════════════╗
  ║              🧬 AgentDNA Store            ║
  ║                                           ║
  ║  preferences: conservative, 70%+          ║
  ║  skills: Kotlin, Python, Android → AI     ║
  ║  relationships: monday.com, Taka.ai       ║
  ║  history: first trade was HOOD spread     ║
  ║                                           ║
  ║  Visibility: shared | private | selective ║
  ╚═══════════════════════════════════════════╝
```

**LifeBot onboards → immediately knows everything shared.**

## Features

- 📝 **Learn** — Agents contribute knowledge about the user
- 🔍 **Recall** — Agents retrieve relevant knowledge
- 🆕 **Onboard** — New agents get instant context
- 🔒 **Visibility** — Private, shared, or selective per-entry
- 📊 **Confidence** — Each entry has a confidence score
- 🏷️ **Source tracking** — Know which agent learned what
- 🔌 **MCP Server** — Use AgentDNA in Claude Desktop, Cursor, Cline, and more

## Quick Start

### Run the Demo

```bash
npm install
npx tsx src/demo.ts
```

### Start the API Server

```bash
npm run build
npm start
# Server runs on http://localhost:3456
```

### Use with MCP Clients (Claude Desktop, Cursor, etc.)

```bash
npm run build
# Add to your MCP config (see MCP.md for details)
```

See [MCP.md](./MCP.md) for full MCP integration guide.

## Architecture

```
User
 └── DNA Store (one per user)
      ├── entries[]
      │    ├── category (preferences/skills/habits/history/relationships)
      │    ├── key + value
      │    ├── source (which agent)
      │    ├── confidence (0-1)
      │    ├── visibility (private/shared/selective)
      │    └── timestamp
      └── agents[] (registered agents)
```

## What's Next

- [x] Persistent storage (SQLite/file-based) ✅
- [x] REST API for agent integration ✅
- [x] Agent-to-agent communication ✅
- [x] User dashboard (see what agents know about you) ✅
- [x] Cross-user agent networking ✅
- [x] MCP Server for Claude Desktop, Cursor, etc. ✅
- [ ] Conflict resolution (two agents disagree)
- [ ] Memory decay (old entries lose confidence)
- [ ] Export/import DNA profiles
- [ ] Multi-modal knowledge (images, voice, etc.)
- [ ] Knowledge graph visualization

## Vision

> Every person has a digital DNA.  
> Every agent reads it.  
> Every interaction enriches it.  
> New agents don't start from zero — they start from you.

---

Built with 🧬 by Daniel & Refaelir
