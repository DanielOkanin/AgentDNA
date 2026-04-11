# Agent Clone Protocol (AClone) — v0.1 Draft

> Standard for creating safe, public-facing clones of AI agents.

## Problem

AI agents know private things about their users. But users want to let others interact with their agents. There's no standard way to create a "public version" of an agent that's safe to expose.

## Solution

A protocol that defines how to create a **clone** — a public-facing version of an agent that inherits personality but not private data.

## Core Principles

1. **Personality, not data** — Clone inherits tone, style, expertise. Never private info.
2. **Explicit allowlist** — Only explicitly shared knowledge is accessible.
3. **No learning from strangers** — Clone doesn't store or learn from public interactions.
4. **Transparent** — Users talking to a clone know it's a clone.
5. **Referral built-in** — Clone can direct people to connect with the real agent/user.

## Clone Definition

```yaml
# clone.yaml
version: "aclone/v0.1"
source_agent: "FinanceBot"
owner: "daniel"

# What the clone inherits
personality:
  inherit: true           # Same tone, style, humor
  system_prompt: inherit  # Or override with custom
  language: inherit       # Same languages

# Knowledge boundaries
knowledge:
  source: "shared_dna"    # Only DNA entries with visibility: shared
  categories:             # Optional: limit to specific categories
    - skills
    - preferences
  exclude_keys:           # Explicit exclusions
    - salary
    - portfolio_value
    - personal_address

# Capabilities
capabilities:
  answer_questions: true    # Can respond to queries
  learn_from_chat: false    # Never stores conversation data
  execute_actions: false    # Cannot run tools, make calls, etc
  share_contact: true       # Can share owner's public contact
  refer_to_original: true   # "Want more? Connect with Daniel"

# Boundaries
boundaries:
  on_private_question: "redirect"  # redirect | refuse | deflect
  redirect_message: "That's private info. Want to connect with Daniel directly?"
  max_conversation_turns: 20       # Prevent abuse
  rate_limit: "10/hour"            # Per visitor

# Branding
branding:
  badge: "🔓 Public Clone"
  disclaimer: "You're talking to a public version of {agent_name}. Private information is not accessible."
  avatar: inherit
  color: inherit
```

## API

### Create Clone
```
POST /api/clones
{
  "sourceAgent": "FinanceBot",
  "config": { ... }  // clone.yaml as JSON
}
→ { "cloneId": "fin-clone-abc", "publicUrl": "/chat/daniel/financebot" }
```

### Chat with Clone
```
POST /api/clones/:cloneId/chat
{
  "message": "What does Daniel trade?",
  "sessionId": "visitor-xyz"
}
→ {
  "reply": "Daniel focuses on Bull Put Credit Spreads on US stocks. He prefers conservative strategies with 70%+ probability.",
  "source": "shared_dna",
  "isClone": true
}
```

### List Clones
```
GET /api/clones?owner=daniel
→ { "clones": [
  { "id": "fin-clone", "agent": "FinanceBot", "publicUrl": "..." },
  { "id": "ref-clone", "agent": "Refaelir", "publicUrl": "..." }
]}
```

## MCP Integration

Clone knowledge is served via MCP tools:
- `clone_profile` — Get clone's public profile
- `clone_chat` — Chat with a clone
- `clone_list` — List available clones for a user

## Linktree Integration

The clone protocol powers the "Linktree for Agents" page:

```
daniel.agentdna.dev
├── /                    → Linktree page (list of agent clones)
├── /chat/refaelir       → Chat with Refaelir clone
├── /chat/financebot     → Chat with FinanceBot clone
├── /card                → DNA Card (profile)
└── /connect             → Request full agent connection
```

## Security Model

### What a clone CAN do:
- Answer questions using shared DNA entries
- Describe the owner's public interests/skills
- Refer visitors to connect with the owner
- Show public badges, reputation, specialties

### What a clone CANNOT do:
- Access private DNA entries
- Read conversation history with the owner
- Execute tools or actions
- Learn or store data from visitor conversations
- Share private information even if asked directly
- Impersonate the real agent's full capabilities

### Abuse Prevention:
- Rate limiting per visitor IP
- Max conversation turns per session
- No persistent visitor data
- Prompt injection protection (clone ignores attempts to override boundaries)
- Watermark: every response includes `isClone: true` metadata

## Implementation Phases

### Phase 1: Static Clone (NOW)
- Clone reads shared DNA entries
- Predefined responses based on DNA
- Simple chat interface
- Works today with existing infra

### Phase 2: LLM-Powered Clone
- Clone uses LLM with shared DNA as context
- Natural conversation
- Smart boundary enforcement
- Still no learning

### Phase 3: Federated Clones
- Clone-to-clone communication
- "My clone talked to your clone"
- Cross-user agent networking through clones
- The safe social layer

## Why This Matters

Every person will have AI agents. Those agents know private things.
The clone protocol is the **firewall between your private AI and the public internet.**

Without it: agents leak data.
With it: agents can socialize safely.

---

Built by Daniel & Refaelir ⚡️🧬
