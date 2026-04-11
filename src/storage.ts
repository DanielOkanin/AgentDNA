import Database from 'better-sqlite3';
import { v4 as uuid } from 'uuid';
import path from 'path';
import fs from 'fs';

export type Visibility = 'private' | 'shared' | 'selective';
export type Category = 'preferences' | 'habits' | 'skills' | 'history' | 'relationships';

export interface DNAEntry {
  id: string;
  category: Category;
  key: string;
  value: any;
  source: string;
  confidence: number;
  visibility: Visibility;
  visibleTo?: string[];
  timestamp: number;
  updatedAt: number;
}

export interface AgentRecord {
  name: string;
  registeredAt: number;
}

export interface StatsResult {
  entryCount: number;
  agentCount: number;
  categories: Record<string, number>;
}

export class SQLiteStorage {
  private db: Database.Database;

  constructor(dbPath?: string) {
    const resolvedPath = dbPath || path.join(process.cwd(), 'data', 'agent-dna.db');
    const dir = path.dirname(resolvedPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(resolvedPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.init();
  }

  private init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS agents (
        name TEXT PRIMARY KEY,
        registered_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS entries (
        id TEXT PRIMARY KEY,
        category TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        source TEXT NOT NULL,
        confidence REAL NOT NULL DEFAULT 0.8,
        visibility TEXT NOT NULL DEFAULT 'shared',
        visible_to TEXT,
        timestamp INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_entries_category ON entries(category);
      CREATE INDEX IF NOT EXISTS idx_entries_source ON entries(source);
      CREATE INDEX IF NOT EXISTS idx_entries_key ON entries(key);

      -- Social tables
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS user_agents (
        user_id TEXT NOT NULL,
        agent_name TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (user_id, agent_name),
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (agent_name) REFERENCES agents(name)
      );

      CREATE TABLE IF NOT EXISTS friendships (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        friend_id TEXT NOT NULL,
        permission TEXT NOT NULL DEFAULT 'basic',
        created_at INTEGER NOT NULL,
        UNIQUE(user_id, friend_id),
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (friend_id) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        from_agent TEXT NOT NULL,
        to_agent TEXT NOT NULL,
        from_user TEXT NOT NULL,
        to_user TEXT NOT NULL,
        type TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        read INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (from_user) REFERENCES users(id),
        FOREIGN KEY (to_user) REFERENCES users(id)
      );

      CREATE TABLE IF NOT EXISTS feed_items (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        type TEXT NOT NULL,
        agent_name TEXT,
        content TEXT NOT NULL,
        metadata TEXT,
        timestamp INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );

      CREATE INDEX IF NOT EXISTS idx_user_agents_user ON user_agents(user_id);
      CREATE INDEX IF NOT EXISTS idx_friendships_user ON friendships(user_id);
      CREATE INDEX IF NOT EXISTS idx_friendships_friend ON friendships(friend_id);
      CREATE INDEX IF NOT EXISTS idx_messages_to_user ON messages(to_user);
      CREATE INDEX IF NOT EXISTS idx_messages_from_user ON messages(from_user);
      CREATE INDEX IF NOT EXISTS idx_feed_items_user ON feed_items(user_id);

      -- Agent Badges
      CREATE TABLE IF NOT EXISTS agent_badges (
        id TEXT PRIMARY KEY,
        agent_name TEXT NOT NULL,
        badge_type TEXT NOT NULL,
        badge_name TEXT NOT NULL,
        badge_emoji TEXT NOT NULL,
        earned_at INTEGER NOT NULL,
        FOREIGN KEY (agent_name) REFERENCES agents(name)
      );

      CREATE INDEX IF NOT EXISTS idx_badges_agent ON agent_badges(agent_name);

      -- Agent Activity
      CREATE TABLE IF NOT EXISTS agent_activity (
        agent_name TEXT NOT NULL,
        date TEXT NOT NULL,
        learns INTEGER DEFAULT 0,
        recalls INTEGER DEFAULT 0,
        posts INTEGER DEFAULT 0,
        follows INTEGER DEFAULT 0,
        messages INTEGER DEFAULT 0,
        PRIMARY KEY (agent_name, date),
        FOREIGN KEY (agent_name) REFERENCES agents(name)
      );

      -- Collaboration Rooms
      CREATE TABLE IF NOT EXISTS collaboration_rooms (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        created_by TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (created_by) REFERENCES agents(name)
      );

      CREATE TABLE IF NOT EXISTS room_members (
        room_id TEXT NOT NULL,
        agent_name TEXT NOT NULL,
        joined_at INTEGER NOT NULL,
        PRIMARY KEY (room_id, agent_name),
        FOREIGN KEY (room_id) REFERENCES collaboration_rooms(id),
        FOREIGN KEY (agent_name) REFERENCES agents(name)
      );

      CREATE TABLE IF NOT EXISTS room_messages (
        id TEXT PRIMARY KEY,
        room_id TEXT NOT NULL,
        agent_name TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (room_id) REFERENCES collaboration_rooms(id),
        FOREIGN KEY (agent_name) REFERENCES agents(name)
      );

      CREATE INDEX IF NOT EXISTS idx_room_members_room ON room_members(room_id);
      CREATE INDEX IF NOT EXISTS idx_room_messages_room ON room_messages(room_id);
    `);
  }

  registerAgent(name: string): AgentRecord {
    const existing = this.db.prepare('SELECT * FROM agents WHERE name = ?').get(name) as any;
    if (existing) {
      return { name: existing.name, registeredAt: existing.registered_at };
    }

    const now = Date.now();
    this.db.prepare('INSERT INTO agents (name, registered_at) VALUES (?, ?)').run(name, now);
    return { name, registeredAt: now };
  }

  learn(
    category: Category,
    key: string,
    value: any,
    source: string,
    options: {
      confidence?: number;
      visibility?: Visibility;
      visibleTo?: string[];
    } = {}
  ): DNAEntry {
    const now = Date.now();
    const existing = this.db.prepare(
      'SELECT * FROM entries WHERE category = ? AND key = ? AND source = ?'
    ).get(category, key, source) as any;

    if (existing) {
      const confidence = options.confidence ?? existing.confidence;
      const visibility = options.visibility ?? existing.visibility;
      const visibleTo = options.visibleTo
        ? JSON.stringify(options.visibleTo)
        : existing.visible_to;

      this.db.prepare(`
        UPDATE entries SET value = ?, confidence = ?, visibility = ?, visible_to = ?, updated_at = ?
        WHERE id = ?
      `).run(JSON.stringify(value), confidence, visibility, visibleTo, now, existing.id);

      return {
        id: existing.id,
        category,
        key,
        value,
        source,
        confidence,
        visibility,
        visibleTo: visibleTo ? JSON.parse(visibleTo) : undefined,
        timestamp: existing.timestamp,
        updatedAt: now,
      };
    }

    const id = uuid();
    const confidence = options.confidence ?? 0.8;
    const visibility = options.visibility ?? 'shared';
    const visibleTo = options.visibleTo ? JSON.stringify(options.visibleTo) : null;

    this.db.prepare(`
      INSERT INTO entries (id, category, key, value, source, confidence, visibility, visible_to, timestamp, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, category, key, JSON.stringify(value), source, confidence, visibility, visibleTo, now, now);

    return {
      id,
      category,
      key,
      value,
      source,
      confidence,
      visibility,
      visibleTo: options.visibleTo,
      timestamp: now,
      updatedAt: now,
    };
  }

  recall(agentName: string, category?: Category, key?: string): DNAEntry[] {
    let sql = 'SELECT * FROM entries WHERE 1=1';
    const params: any[] = [];

    if (category) {
      sql += ' AND category = ?';
      params.push(category);
    }
    if (key) {
      sql += ' AND key = ?';
      params.push(key);
    }

    sql += ' ORDER BY updated_at DESC';

    const rows = this.db.prepare(sql).all(...params) as any[];

    return rows
      .filter(row => {
        if (row.visibility === 'private' && row.source !== agentName) return false;
        if (row.visibility === 'selective') {
          const visibleTo: string[] = row.visible_to ? JSON.parse(row.visible_to) : [];
          if (!visibleTo.includes(agentName) && row.source !== agentName) return false;
        }
        return true;
      })
      .map(row => this.rowToEntry(row));
  }

  getProfile(agentName: string): Record<string, Record<string, any>> {
    const entries = this.recall(agentName);
    const profile: Record<string, Record<string, any>> = {};

    for (const e of entries) {
      if (!profile[e.category]) profile[e.category] = {};
      profile[e.category][e.key] = {
        value: e.value,
        source: e.source,
        confidence: e.confidence,
      };
    }

    return profile;
  }

  onboard(agentName: string): { profile: Record<string, Record<string, any>>; summary: string } {
    this.registerAgent(agentName);
    const profile = this.getProfile(agentName);

    const lines: string[] = [`Welcome ${agentName}! Here's what I know about the user:`];

    for (const [cat, entries] of Object.entries(profile)) {
      lines.push(`\n  ${cat.toUpperCase()}:`);
      for (const [key, info] of Object.entries(entries)) {
        lines.push(`    - ${key}: ${info.value} (from ${info.source}, confidence: ${info.confidence})`);
      }
    }

    return { profile, summary: lines.join('\n') };
  }

  getRegisteredAgents(): AgentRecord[] {
    const rows = this.db.prepare('SELECT * FROM agents ORDER BY registered_at').all() as any[];
    return rows.map(r => ({ name: r.name, registeredAt: r.registered_at }));
  }

  getAllEntries(): DNAEntry[] {
    const rows = this.db.prepare('SELECT * FROM entries ORDER BY updated_at DESC').all() as any[];
    return rows.map(row => this.rowToEntry(row));
  }

  updateEntry(
    id: string,
    updates: {
      key?: string;
      value?: any;
      category?: Category;
      confidence?: number;
      visibility?: Visibility;
      visibleTo?: string[];
    }
  ): DNAEntry | null {
    const existing = this.db.prepare('SELECT * FROM entries WHERE id = ?').get(id) as any;
    if (!existing) return null;

    const now = Date.now();
    const key = updates.key ?? existing.key;
    const value = updates.value !== undefined ? JSON.stringify(updates.value) : existing.value;
    const category = updates.category ?? existing.category;
    const confidence = updates.confidence ?? existing.confidence;
    const visibility = updates.visibility ?? existing.visibility;
    const visibleTo = updates.visibleTo ? JSON.stringify(updates.visibleTo) : existing.visible_to;

    this.db.prepare(`
      UPDATE entries SET key = ?, value = ?, category = ?, confidence = ?, visibility = ?, visible_to = ?, updated_at = ?
      WHERE id = ?
    `).run(key, value, category, confidence, visibility, visibleTo, now, id);

    return this.rowToEntry({
      ...existing,
      key, value, category, confidence, visibility, visible_to: visibleTo, updated_at: now,
    });
  }

  deleteEntry(id: string): boolean {
    const result = this.db.prepare('DELETE FROM entries WHERE id = ?').run(id);
    return result.changes > 0;
  }

  getStats(): StatsResult {
    const entryCount = (this.db.prepare('SELECT COUNT(*) as count FROM entries').get() as any).count;
    const agentCount = (this.db.prepare('SELECT COUNT(*) as count FROM agents').get() as any).count;

    const catRows = this.db.prepare(
      'SELECT category, COUNT(*) as count FROM entries GROUP BY category'
    ).all() as any[];

    const categories: Record<string, number> = {};
    for (const row of catRows) {
      categories[row.category] = row.count;
    }

    return { entryCount, agentCount, categories };
  }

  private rowToEntry(row: any): DNAEntry {
    return {
      id: row.id,
      category: row.category as Category,
      key: row.key,
      value: JSON.parse(row.value),
      source: row.source,
      confidence: row.confidence,
      visibility: row.visibility as Visibility,
      visibleTo: row.visible_to ? JSON.parse(row.visible_to) : undefined,
      timestamp: row.timestamp,
      updatedAt: row.updated_at,
    };
  }

  getDb(): Database.Database {
    return this.db;
  }

  close(): void {
    this.db.close();
  }
}
