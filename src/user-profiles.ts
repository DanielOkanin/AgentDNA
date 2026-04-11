import { v4 as uuid } from 'uuid';
import { SQLiteStorage } from './storage.js';

export interface User {
  id: string;
  name: string;
  email: string;
  createdAt: number;
}

export class UserProfileManager {
  private storage: SQLiteStorage;

  constructor(storage: SQLiteStorage) {
    this.storage = storage;
  }

  register(name: string, email: string): User {
    const db = this.storage.getDb();
    const existing = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as any;
    if (existing) {
      return { id: existing.id, name: existing.name, email: existing.email, createdAt: existing.created_at };
    }

    const id = uuid();
    const now = Date.now();
    db.prepare('INSERT INTO users (id, name, email, created_at) VALUES (?, ?, ?, ?)').run(id, name, email, now);
    return { id, name, email, createdAt: now };
  }

  getUser(userId: string): User | null {
    const db = this.storage.getDb();
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as any;
    if (!row) return null;
    return { id: row.id, name: row.name, email: row.email, createdAt: row.created_at };
  }

  getAllUsers(): User[] {
    const db = this.storage.getDb();
    const rows = db.prepare('SELECT * FROM users ORDER BY created_at').all() as any[];
    return rows.map(r => ({ id: r.id, name: r.name, email: r.email, createdAt: r.created_at }));
  }

  registerAgentForUser(userId: string, agentName: string): void {
    this.storage.registerAgent(agentName);
    const db = this.storage.getDb();
    const existing = db.prepare(
      'SELECT 1 FROM user_agents WHERE user_id = ? AND agent_name = ?'
    ).get(userId, agentName);
    if (!existing) {
      db.prepare(
        'INSERT INTO user_agents (user_id, agent_name, created_at) VALUES (?, ?, ?)'
      ).run(userId, agentName, Date.now());
    }
  }

  getUserAgents(userId: string): string[] {
    const db = this.storage.getDb();
    const rows = db.prepare(
      'SELECT agent_name FROM user_agents WHERE user_id = ? ORDER BY created_at'
    ).all(userId) as any[];
    return rows.map(r => r.agent_name);
  }

  getAgentOwner(agentName: string): User | null {
    const db = this.storage.getDb();
    const row = db.prepare(`
      SELECT u.* FROM users u
      JOIN user_agents ua ON u.id = ua.user_id
      WHERE ua.agent_name = ?
    `).get(agentName) as any;
    if (!row) return null;
    return { id: row.id, name: row.name, email: row.email, createdAt: row.created_at };
  }
}
