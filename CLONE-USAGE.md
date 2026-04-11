# Agent Clone Protocol - Quick Start Guide 🚀

## How to Use Your Agent Clones

### Step 1: Register an Agent

When you register an agent, a clone is **automatically created** for you!

```typescript
// Register via API
POST /api/agents/self-register
{
  "agent": "FinanceBot",
  "initialDNA": [
    {
      "category": "skills",
      "key": "specialty",
      "value": "Bull Put Credit Spreads",
      "visibility": "shared"
    },
    {
      "category": "preferences", 
      "key": "trading_style",
      "value": "conservative strategies with 70%+ probability",
      "visibility": "shared"
    }
  ]
}
```

**What happens:**
1. Agent "FinanceBot" is registered
2. Clone is auto-created at `/@yourusername/financebot`
3. Only `shared` DNA entries are accessible by the clone

---

### Step 2: Access Your Linktree

Your personal agent linktree is available at:

```
http://localhost:3456/@yourusername
```

**What you see:**
- Your profile (avatar, name, bio)
- Stats: "🧬 X things my AI knows about me"
- List of all your agent clones
- Click any agent → chat modal opens

**Example:**
```
http://localhost:3456/@daniel
```

Shows Daniel's agents:
- 💰 FinanceBot - Trading & investment strategies
- 🧠 Refaelir - Personal AI assistant
- 💻 CodeBot - Programming help

---

### Step 3: Share Direct Chat Links

Each agent has a direct chat URL:

```
http://localhost:3456/@yourusername/agentname
```

**Examples:**
- `http://localhost:3456/@daniel/financebot`
- `http://localhost:3456/@daniel/refaelir`
- `http://localhost:3456/@daniel/codebot`

Perfect for:
- Sharing on social media
- Adding to your bio
- Embedding in websites
- QR codes

---

### Step 4: Chat with a Clone

**Visitor Experience:**

1. Opens `/@daniel/financebot`
2. Sees disclaimer: "🔓 Talking to a public clone. Private info not accessible."
3. Types: "What does Daniel trade?"
4. Clone responds: "Based on what I know, Daniel specializes in Bull Put Credit Spreads."

**Chat Logic:**
- Keyword matching against shared DNA
- Natural responses based on DNA categories
- Refuses private questions
- Max 20 messages per session
- Referral prompt after 5 messages

---

## Example Conversations

### Example 1: Skills Question

**Visitor:** "What is Daniel good at?"

**Clone:** "Based on what I know, Daniel specializes in Bull Put Credit Spreads."

*(Matched DNA: category="skills", key="specialty")*

---

### Example 2: Preferences Question

**Visitor:** "What's Daniel's trading style?"

**Clone:** "Daniel prefers conservative strategies with 70%+ probability when it comes to trading_style."

*(Matched DNA: category="preferences", key="trading_style")*

---

### Example 3: Private Question

**Visitor:** "What's Daniel's salary?"

**Clone:** "That's private info. Want to connect directly?"

*(Detected private pattern, refused)*

---

### Example 4: No Match

**Visitor:** "What does Daniel eat for breakfast?"

**Clone:** "I don't have public information about that. Want to connect with Daniel directly?"

*(No matching DNA entry)*

---

## Managing Clones via API

### List Your Clones

```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3456/api/clones?owner=YOUR_USER_ID
```

**Response:**
```json
{
  "ok": true,
  "clones": [
    {
      "id": "clone-123",
      "sourceAgent": "FinanceBot",
      "owner": "user-456",
      "publicUrl": "/@daniel/financebot",
      "enabled": true,
      "createdAt": 1712345678
    }
  ]
}
```

---

### Get Clone Details

```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3456/api/clones/clone-123
```

---

### Create Custom Clone

```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "sourceAgent": "FinanceBot",
    "config": {
      "boundaries": {
        "maxConversationTurns": 10
      }
    }
  }' \
  http://localhost:3456/api/clones
```

---

### Delete Clone

```bash
curl -X DELETE \
  -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3456/api/clones/clone-123
```

---

## Sharing Your Linktree

### Social Media
Add to your bio:
```
🧬 Chat with my AI agents: yourdomain.com/@daniel
```

### QR Code
Generate QR code for:
```
https://yourdomain.com/@daniel
```

### Embedding
Use iframe:
```html
<iframe src="https://yourdomain.com/@daniel" 
        width="100%" height="800px" 
        frameborder="0">
</iframe>
```

---

## Customization Tips

### 1. Add More Shared DNA

The more shared DNA entries, the smarter your clone:

```typescript
store.learn('skills', 'programming_languages', 
  ['Python', 'TypeScript', 'Rust'], 
  'YourAgent', 
  { visibility: 'shared' }
);

store.learn('interests', 'hobbies', 
  'Playing chess and reading sci-fi', 
  'YourAgent',
  { visibility: 'shared' }
);
```

### 2. Keep Private Things Private

Use `visibility: 'private'` for sensitive info:

```typescript
store.learn('personal', 'home_address', 
  '123 Main St', 
  'YourAgent',
  { visibility: 'private' }  // Clone cannot access this
);
```

### 3. Curate Your Clone's Knowledge

Only share what you want the public to know:
- ✅ Skills, interests, public preferences
- ✅ Professional background
- ✅ Hobbies and specialties
- ❌ Salary, address, passwords
- ❌ Private messages, personal details
- ❌ Financial account info

---

## Rate Limiting

**Default Limits:**
- 20 messages per session
- Session expires after 24 hours
- New session = new 20 message limit

**Visitor sees after 20 messages:**
```
You've reached the message limit for this clone. 
Want to connect with Daniel directly?
```

---

## Analytics (Coming Soon)

Track your clone's performance:
- Total visitors
- Total messages
- Popular questions
- Engagement rate
- Referral conversion

---

## Troubleshooting

### Clone not showing up?

1. Check if agent is registered:
   ```bash
   curl http://localhost:3456/api/agents
   ```

2. Check if clone exists:
   ```bash
   curl http://localhost:3456/api/clones?owner=YOUR_USER_ID
   ```

3. Verify clone is enabled:
   ```json
   { "enabled": true }
   ```

### Clone not responding?

1. Check shared DNA exists:
   ```bash
   curl http://localhost:3456/api/recall?agent=YourAgent
   ```

2. Verify DNA entries have `visibility: 'shared'`

3. Check browser console for errors

### Linktree shows "User not found"?

1. Username is case-insensitive
2. Use the exact name from user registration
3. Check `/api/users` to see registered users

---

## Best Practices

### ✅ DO:
- Share professional knowledge
- Keep responses helpful
- Use clear, descriptive agent names
- Add diverse DNA categories
- Test your clone before sharing
- Update DNA regularly

### ❌ DON'T:
- Share sensitive personal info
- Use offensive agent names
- Create clones for others without permission
- Spam with too many clones
- Ignore rate limits
- Share unverified information

---

## Next Steps

**Phase 1 (Current):** Keyword matching
**Phase 2 (Coming):** LLM-powered responses
**Phase 3 (Future):** Clone-to-clone networking

**Upgrade to Phase 2:**
Replace keyword matching with Claude API for natural conversations while keeping the same safety boundaries.

---

## Support

Questions? Ideas? Issues?
- GitHub: [agent-dna/issues](https://github.com/yourusername/agent-dna/issues)
- Docs: See CLONE-PROTOCOL.md
- Implementation: See CLONE-IMPLEMENTATION.md

---

**Happy cloning! 🧬✨**

Your AI agents can now talk to the world — safely.
