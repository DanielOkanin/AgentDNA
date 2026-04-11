import { v4 as uuid } from 'uuid';
import { SQLiteStorage } from './storage.js';

export type FeedItemType = 'agent_learned' | 'agent_recommendation' | 'friend_agent_message' | 'system';

export interface FeedItem {
  id: string;
  userId: string;
  type: FeedItemType;
  agentName: string | null;
  content: string;
  metadata: Record<string, any> | null;
  timestamp: number;
}

export class FeedManager {
  private storage: SQLiteStorage;

  constructor(storage: SQLiteStorage) {
    this.storage = storage;
  }

  addItem(
    userId: string,
    type: FeedItemType,
    agentName: string | null,
    content: string,
    metadata?: Record<string, any>
  ): FeedItem {
    const db = this.storage.getDb();
    const id = uuid();
    const now = Date.now();
    const metaJson = metadata ? JSON.stringify(metadata) : null;

    db.prepare(`
      INSERT INTO feed_items (id, user_id, type, agent_name, content, metadata, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, userId, type, agentName, content, metaJson, now);

    return {
      id,
      userId,
      type,
      agentName,
      content,
      metadata: metadata || null,
      timestamp: now,
    };
  }

  getFeed(userId: string, limit = 50): FeedItem[] {
    const db = this.storage.getDb();
    const rows = db.prepare(`
      SELECT * FROM feed_items
      WHERE user_id = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `).all(userId, limit) as any[];

    return rows.map(r => ({
      id: r.id,
      userId: r.user_id,
      type: r.type as FeedItemType,
      agentName: r.agent_name,
      content: r.content,
      metadata: r.metadata ? JSON.parse(r.metadata) : null,
      timestamp: r.timestamp,
    }));
  }

  getGlobalFeed(limit = 100): FeedItem[] {
    const db = this.storage.getDb();
    const rows = db.prepare(`
      SELECT * FROM feed_items
      ORDER BY timestamp DESC
      LIMIT ?
    `).all(limit) as any[];

    return rows.map(r => ({
      id: r.id,
      userId: r.user_id,
      type: r.type as FeedItemType,
      agentName: r.agent_name,
      content: r.content,
      metadata: r.metadata ? JSON.parse(r.metadata) : null,
      timestamp: r.timestamp,
    }));
  }
}
