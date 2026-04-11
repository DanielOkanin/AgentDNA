import { v4 as uuid } from 'uuid';
import { SQLiteStorage } from './storage.js';

export interface Clone {
  id: string;
  sourceAgent: string;
  owner: string;
  config: CloneConfig;
  publicUrl: string;
  createdAt: number;
  enabled: boolean;
}

export interface CloneConfig {
  personality: {
    inherit: boolean;
    systemPrompt?: string;
    language: string;
  };
  knowledge: {
    source: 'shared_dna';
    categories?: string[];
    excludeKeys?: string[];
  };
  capabilities: {
    answerQuestions: boolean;
    learnFromChat: boolean;
    executeActions: boolean;
    shareContact: boolean;
    referToOriginal: boolean;
  };
  boundaries: {
    onPrivateQuestion: 'redirect' | 'refuse' | 'deflect';
    redirectMessage: string;
    maxConversationTurns: number;
    rateLimit: string;
  };
  branding: {
    badge: string;
    disclaimer: string;
  };
}

export interface CloneSession {
  id: string;
  cloneId: string;
  visitorIp: string;
  messagesCount: number;
  createdAt: number;
  lastMessageAt: number;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  source?: string;
}

export class CloneManager {
  private storage: SQLiteStorage;

  constructor(storage: SQLiteStorage) {
    this.storage = storage;
    this.initTables();
  }

  private initTables(): void {
    const db = this.storage.getDb();

    db.exec(`
      CREATE TABLE IF NOT EXISTS clones (
        id TEXT PRIMARY KEY,
        source_agent TEXT NOT NULL,
        owner TEXT NOT NULL,
        config TEXT NOT NULL,
        public_url TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        FOREIGN KEY (source_agent) REFERENCES agents(name),
        FOREIGN KEY (owner) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS clone_sessions (
        id TEXT PRIMARY KEY,
        clone_id TEXT NOT NULL,
        visitor_ip TEXT NOT NULL,
        messages_count INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        last_message_at INTEGER NOT NULL,
        FOREIGN KEY (clone_id) REFERENCES clones(id)
      );

      CREATE INDEX IF NOT EXISTS idx_clones_owner ON clones(owner);
      CREATE INDEX IF NOT EXISTS idx_clones_agent ON clones(source_agent);
      CREATE INDEX IF NOT EXISTS idx_clone_sessions_clone ON clone_sessions(clone_id);
      CREATE INDEX IF NOT EXISTS idx_clone_sessions_visitor ON clone_sessions(visitor_ip);
    `);
  }

  createClone(sourceAgent: string, owner: string, config?: Partial<CloneConfig>): Clone {
    const db = this.storage.getDb();
    const id = uuid();
    const now = Date.now();

    const defaultConfig: CloneConfig = {
      personality: {
        inherit: true,
        language: 'inherit',
      },
      knowledge: {
        source: 'shared_dna',
        excludeKeys: ['salary', 'portfolio_value', 'personal_address', 'password', 'ssn', 'credit_card'],
      },
      capabilities: {
        answerQuestions: true,
        learnFromChat: false,
        executeActions: false,
        shareContact: true,
        referToOriginal: true,
      },
      boundaries: {
        onPrivateQuestion: 'redirect',
        redirectMessage: "That's private info. Want to connect directly?",
        maxConversationTurns: 20,
        rateLimit: '20/session',
      },
      branding: {
        badge: '🔓 Public Clone',
        disclaimer: "You're talking to a public version of {agent}. Private information is not accessible.",
      },
    };

    const mergedConfig = { ...defaultConfig, ...config };
    const publicUrl = `/@${owner}/${sourceAgent.toLowerCase().replace(/\s+/g, '-')}`;

    db.prepare(`
      INSERT INTO clones (id, source_agent, owner, config, public_url, created_at, enabled)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `).run(id, sourceAgent, owner, JSON.stringify(mergedConfig), publicUrl, now);

    return {
      id,
      sourceAgent,
      owner,
      config: mergedConfig,
      publicUrl,
      createdAt: now,
      enabled: true,
    };
  }

  getClone(cloneId: string): Clone | null {
    const db = this.storage.getDb();
    const row = db.prepare('SELECT * FROM clones WHERE id = ?').get(cloneId) as any;
    if (!row) return null;
    return this.rowToClone(row);
  }

  getCloneByUrl(slug: string): Clone | null {
    const db = this.storage.getDb();
    const row = db.prepare('SELECT * FROM clones WHERE public_url = ?').get(slug) as any;
    if (!row) return null;
    return this.rowToClone(row);
  }

  getCloneByAgent(sourceAgent: string, owner: string): Clone | null {
    const db = this.storage.getDb();
    const row = db.prepare('SELECT * FROM clones WHERE source_agent = ? AND owner = ?').get(sourceAgent, owner) as any;
    if (!row) return null;
    return this.rowToClone(row);
  }

  listClones(owner: string): Clone[] {
    const db = this.storage.getDb();
    const rows = db.prepare('SELECT * FROM clones WHERE owner = ? ORDER BY created_at DESC').all(owner) as any[];
    return rows.map(r => this.rowToClone(r));
  }

  deleteClone(cloneId: string): boolean {
    const db = this.storage.getDb();
    const result = db.prepare('DELETE FROM clones WHERE id = ?').run(cloneId);
    return result.changes > 0;
  }

  private rowToClone(row: any): Clone {
    return {
      id: row.id,
      sourceAgent: row.source_agent,
      owner: row.owner,
      config: JSON.parse(row.config),
      publicUrl: row.public_url,
      createdAt: row.created_at,
      enabled: row.enabled === 1,
    };
  }

  // ══════════════════════════════════════
  // Session Management
  // ══════════════════════════════════════

  getOrCreateSession(cloneId: string, visitorIp: string): CloneSession {
    const db = this.storage.getDb();
    const now = Date.now();

    // Find existing session from last 24 hours
    const existing = db.prepare(`
      SELECT * FROM clone_sessions
      WHERE clone_id = ? AND visitor_ip = ? AND created_at > ?
      ORDER BY last_message_at DESC
      LIMIT 1
    `).get(cloneId, visitorIp, now - 24 * 60 * 60 * 1000) as any;

    if (existing) {
      return {
        id: existing.id,
        cloneId: existing.clone_id,
        visitorIp: existing.visitor_ip,
        messagesCount: existing.messages_count,
        createdAt: existing.created_at,
        lastMessageAt: existing.last_message_at,
      };
    }

    // Create new session
    const id = uuid();
    db.prepare(`
      INSERT INTO clone_sessions (id, clone_id, visitor_ip, messages_count, created_at, last_message_at)
      VALUES (?, ?, ?, 0, ?, ?)
    `).run(id, cloneId, visitorIp, now, now);

    return {
      id,
      cloneId,
      visitorIp,
      messagesCount: 0,
      createdAt: now,
      lastMessageAt: now,
    };
  }

  updateSession(sessionId: string): void {
    const db = this.storage.getDb();
    const now = Date.now();
    db.prepare(`
      UPDATE clone_sessions
      SET messages_count = messages_count + 1, last_message_at = ?
      WHERE id = ?
    `).run(now, sessionId);
  }

  checkRateLimit(session: CloneSession, maxMessages: number): boolean {
    return session.messagesCount < maxMessages;
  }

  // ══════════════════════════════════════
  // Chat Logic (Phase 1: Keyword Matching)
  // ══════════════════════════════════════

  chat(cloneId: string, message: string, visitorIp: string): {
    reply: string;
    source: string;
    isClone: boolean;
    hitLimit?: boolean;
  } {
    const clone = this.getClone(cloneId);
    if (!clone || !clone.enabled) {
      return {
        reply: "This clone is not available.",
        source: 'system',
        isClone: true,
      };
    }

    const session = this.getOrCreateSession(cloneId, visitorIp);

    // Check rate limit
    if (!this.checkRateLimit(session, 20)) {
      return {
        reply: `You've reached the message limit for this clone. Want to connect with ${clone.owner} directly?`,
        source: 'system',
        isClone: true,
        hitLimit: true,
      };
    }

    // Update session
    this.updateSession(session.id);

    // Get shared DNA entries
    const sharedDNA = this.storage.recall(clone.sourceAgent)
      .filter(e => e.visibility === 'shared')
      .filter(e => !clone.config.knowledge.excludeKeys?.includes(e.key));

    // Check for private question patterns
    const privatePatterns = [
      /password/i,
      /ssn|social security/i,
      /credit card|bank account/i,
      /salary|income|earnings/i,
      /address|home|location/i,
      /private|secret|confidential/i,
    ];

    const isPrivateQuestion = privatePatterns.some(p => p.test(message));

    if (isPrivateQuestion) {
      return {
        reply: clone.config.boundaries.redirectMessage,
        source: 'boundary',
        isClone: true,
      };
    }

    // Keyword matching against DNA entries
    const messageLower = message.toLowerCase();
    const keywords = messageLower.split(/\s+/).filter(w => w.length > 3);

    let bestMatch: any = null;
    let bestScore = 0;

    for (const entry of sharedDNA) {
      let score = 0;
      const entryText = `${entry.key} ${entry.category} ${JSON.stringify(entry.value)}`.toLowerCase();

      for (const keyword of keywords) {
        if (entryText.includes(keyword)) {
          score += entry.confidence;
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = entry;
      }
    }

    // Generate response
    if (bestMatch && bestScore > 0) {
      const response = this.generateResponse(bestMatch, clone.owner);
      return {
        reply: response,
        source: 'shared_dna',
        isClone: true,
      };
    }

    // No match - generic response
    const genericResponses = [
      `I don't have public information about that. Want to connect with ${clone.owner} directly?`,
      `That's not something I can share publicly. Try connecting with ${clone.owner} for more details.`,
      `I'm a public clone with limited knowledge. For deeper conversations, connect with ${clone.owner}.`,
    ];

    const response = genericResponses[Math.floor(Math.random() * genericResponses.length)];

    // Add referral hint after 5 messages
    if (session.messagesCount >= 5 && clone.config.capabilities.referToOriginal) {
      return {
        reply: `${response}\n\nℹ️ Want deeper access? Connect with ${clone.owner}'s full agent.`,
        source: 'no_match',
        isClone: true,
      };
    }

    return {
      reply: response,
      source: 'no_match',
      isClone: true,
    };
  }

  private generateResponse(entry: any, owner: string): string {
    const templates = [
      `Based on what I know, ${owner} ${this.valueToPhrase(entry.key, entry.value)}.`,
      `${owner} ${this.valueToPhrase(entry.key, entry.value)}.`,
      `I can tell you that ${owner} ${this.valueToPhrase(entry.key, entry.value)}.`,
      `From what I've learned, ${owner} ${this.valueToPhrase(entry.key, entry.value)}.`,
    ];

    return templates[Math.floor(Math.random() * templates.length)];
  }

  private valueToPhrase(key: string, value: any): string {
    const keyLower = key.toLowerCase();

    if (keyLower.includes('prefer') || keyLower.includes('like')) {
      return `prefers ${value}`;
    }

    if (keyLower.includes('speciali') || keyLower.includes('skill')) {
      return `specializes in ${value}`;
    }

    if (keyLower.includes('interest') || keyLower.includes('hobby')) {
      return `is interested in ${value}`;
    }

    if (keyLower.includes('goal') || keyLower.includes('objective')) {
      return `has a goal of ${value}`;
    }

    if (keyLower.includes('habit')) {
      return `has a habit of ${value}`;
    }

    // Default
    return `has ${key}: ${value}`;
  }

  // ══════════════════════════════════════
  // Public Profile for Linktree
  // ══════════════════════════════════════

  getCloneProfile(cloneId: string): {
    clone: Clone | null;
    agent: any;
    dnaCount: number;
    specialties: string[];
    bio: string;
  } | null {
    const clone = this.getClone(cloneId);
    if (!clone) return null;

    const agentProfile = this.storage.getProfile(clone.sourceAgent);
    const sharedDNA = this.storage.recall(clone.sourceAgent).filter(e => e.visibility === 'shared');

    // Extract specialties from DNA or profile
    const specialties: string[] = [];
    for (const entry of sharedDNA) {
      if (entry.category === 'skills' || entry.key.toLowerCase().includes('specialty')) {
        if (Array.isArray(entry.value)) {
          specialties.push(...entry.value);
        } else {
          specialties.push(String(entry.value));
        }
      }
    }

    // Get bio from DNA or use default
    let bio = '';
    const bioEntry = sharedDNA.find(e => e.key.toLowerCase().includes('bio') || e.key.toLowerCase().includes('about'));
    if (bioEntry) {
      bio = String(bioEntry.value);
    }

    return {
      clone,
      agent: agentProfile,
      dnaCount: sharedDNA.length,
      specialties: [...new Set(specialties)].slice(0, 5),
      bio,
    };
  }
}
