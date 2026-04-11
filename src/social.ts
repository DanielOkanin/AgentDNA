import Database from 'better-sqlite3';
import { v4 as uuid } from 'uuid';
import { SQLiteStorage } from './storage.js';

export type Permission = 'none' | 'basic' | 'full';

export interface User {
  id: string;
  name: string;
  email: string;
  createdAt: number;
}

export interface Friendship {
  id: string;
  userId: string;
  friendId: string;
  permission: Permission;
  createdAt: number;
}

export interface AgentMessage {
  id: string;
  fromAgent: string;
  toAgent: string;
  fromUser: string;
  toUser: string;
  type: 'recommendation' | 'request' | 'alert' | 'info';
  content: string;
  timestamp: number;
  read: boolean;
}

export interface FeedItem {
  id: string;
  userId: string;
  type: 'agent_learned' | 'agent_recommendation' | 'friend_agent_message' | 'system';
  agentName?: string;
  content: string;
  timestamp: number;
}

export class SocialLayer {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
    this.initTables();
  }

  private initTables() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        createdAt INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS friendships (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        friendId TEXT NOT NULL,
        permission TEXT NOT NULL DEFAULT 'basic',
        createdAt INTEGER NOT NULL,
        UNIQUE(userId, friendId)
      );

      CREATE TABLE IF NOT EXISTS agent_messages (
        id TEXT PRIMARY KEY,
        fromAgent TEXT NOT NULL,
        toAgent TEXT NOT NULL,
        fromUser TEXT NOT NULL,
        toUser TEXT NOT NULL,
        type TEXT NOT NULL,
        content TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        read INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS feed (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        type TEXT NOT NULL,
        agentName TEXT,
        content TEXT NOT NULL,
        timestamp INTEGER NOT NULL
      );
    `);
  }

  // ── Users ──

  registerUser(name: string, email: string): User {
    const user: User = { id: uuid(), name, email, createdAt: Date.now() };
    this.db.prepare('INSERT INTO users (id, name, email, createdAt) VALUES (?, ?, ?, ?)').run(user.id, user.name, user.email, user.createdAt);
    this.addFeedItem(user.id, 'system', undefined, `Welcome ${name}! Your AgentDNA profile is ready.`);
    return user;
  }

  getUser(userId: string): User | undefined {
    return this.db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as User | undefined;
  }

  getAllUsers(): User[] {
    return this.db.prepare('SELECT * FROM users ORDER BY createdAt').all() as User[];
  }

  // ── Friendships ──

  addFriend(userId: string, friendId: string, permission: Permission = 'basic'): Friendship {
    const f: Friendship = { id: uuid(), userId, friendId, permission, createdAt: Date.now() };
    // Bi-directional
    this.db.prepare('INSERT OR IGNORE INTO friendships (id, userId, friendId, permission, createdAt) VALUES (?, ?, ?, ?, ?)').run(f.id, userId, friendId, permission, f.createdAt);
    this.db.prepare('INSERT OR IGNORE INTO friendships (id, userId, friendId, permission, createdAt) VALUES (?, ?, ?, ?, ?)').run(uuid(), friendId, userId, permission, f.createdAt);
    
    const user = this.getUser(userId);
    const friend = this.getUser(friendId);
    this.addFeedItem(userId, 'system', undefined, `You are now connected with ${friend?.name}. Your agents can communicate!`);
    this.addFeedItem(friendId, 'system', undefined, `You are now connected with ${user?.name}. Your agents can communicate!`);
    
    return f;
  }

  getFriends(userId: string): (Friendship & { friendName?: string })[] {
    const friends = this.db.prepare('SELECT f.*, u.name as friendName FROM friendships f LEFT JOIN users u ON f.friendId = u.id WHERE f.userId = ?').all(userId);
    return friends as any[];
  }

  areFriends(userId: string, friendId: string): boolean {
    const row = this.db.prepare('SELECT id FROM friendships WHERE userId = ? AND friendId = ?').get(userId, friendId);
    return !!row;
  }

  getFriendPermission(userId: string, friendId: string): Permission {
    const row = this.db.prepare('SELECT permission FROM friendships WHERE userId = ? AND friendId = ?').get(userId, friendId) as any;
    return row?.permission || 'none';
  }

  // ── Agent Messages ──

  sendMessage(fromAgent: string, toAgent: string, fromUser: string, toUser: string, type: AgentMessage['type'], content: string): AgentMessage | null {
    // Check friendship
    if (!this.areFriends(fromUser, toUser)) {
      return null; // Can't communicate without friendship
    }

    const msg: AgentMessage = {
      id: uuid(), fromAgent, toAgent, fromUser, toUser, type, content,
      timestamp: Date.now(), read: false,
    };

    this.db.prepare('INSERT INTO agent_messages (id, fromAgent, toAgent, fromUser, toUser, type, content, timestamp, read) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
      msg.id, msg.fromAgent, msg.toAgent, msg.fromUser, msg.toUser, msg.type, msg.content, msg.timestamp, 0
    );

    this.addFeedItem(toUser, 'friend_agent_message', toAgent, `${fromAgent} (${this.getUser(fromUser)?.name}'s agent) → ${toAgent}: ${content}`);
    
    return msg;
  }

  getMessages(userId: string, limit = 50): AgentMessage[] {
    return this.db.prepare('SELECT * FROM agent_messages WHERE toUser = ? ORDER BY timestamp DESC LIMIT ?').all(userId, limit) as AgentMessage[];
  }

  // ── Feed ──

  addFeedItem(userId: string, type: FeedItem['type'], agentName: string | undefined, content: string) {
    const item: FeedItem = { id: uuid(), userId, type, agentName, content, timestamp: Date.now() };
    this.db.prepare('INSERT INTO feed (id, userId, type, agentName, content, timestamp) VALUES (?, ?, ?, ?, ?, ?)').run(
      item.id, item.userId, item.type, item.agentName || null, item.content, item.timestamp
    );
  }

  getFeed(userId: string, limit = 50): FeedItem[] {
    return this.db.prepare('SELECT * FROM feed WHERE userId = ? ORDER BY timestamp DESC LIMIT ?').all(userId, limit) as FeedItem[];
  }
}

// ══════════════════════════════════════
// SocialManager — works with SQLiteStorage (snake_case schema)
// Used by server.ts and agent-comms.ts
// ══════════════════════════════════════

export class SocialManager {
  private storage: SQLiteStorage;

  constructor(storage: SQLiteStorage) {
    this.storage = storage;
  }

  addFriend(userId: string, friendId: string, permission: Permission = 'basic'): { id: string; userId: string; friendId: string; permission: Permission; createdAt: number } {
    const db = this.storage.getDb();
    const id = uuid();
    const now = Date.now();

    // Bi-directional
    db.prepare('INSERT OR IGNORE INTO friendships (id, user_id, friend_id, permission, created_at) VALUES (?, ?, ?, ?, ?)').run(id, userId, friendId, permission, now);
    db.prepare('INSERT OR IGNORE INTO friendships (id, user_id, friend_id, permission, created_at) VALUES (?, ?, ?, ?, ?)').run(uuid(), friendId, userId, permission, now);

    return { id, userId, friendId, permission, createdAt: now };
  }

  getFriends(userId: string): Array<{ id: string; friendId: string; friendName: string | null; permission: Permission; connectedAt: number }> {
    const db = this.storage.getDb();
    const rows = db.prepare(`
      SELECT f.id, f.friend_id, u.name as friend_name, f.permission, f.created_at
      FROM friendships f
      LEFT JOIN users u ON f.friend_id = u.id
      WHERE f.user_id = ?
    `).all(userId) as any[];

    return rows.map(r => ({
      id: r.id,
      friendId: r.friend_id,
      friendName: r.friend_name,
      permission: r.permission as Permission,
      connectedAt: r.created_at,
    }));
  }

  areFriends(userId: string, friendId: string): boolean {
    const db = this.storage.getDb();
    const row = db.prepare('SELECT id FROM friendships WHERE user_id = ? AND friend_id = ?').get(userId, friendId);
    return !!row;
  }

  updatePermission(userId: string, friendId: string, permission: Permission): boolean {
    const db = this.storage.getDb();
    const result = db.prepare('UPDATE friendships SET permission = ? WHERE user_id = ? AND friend_id = ?').run(permission, userId, friendId);
    return result.changes > 0;
  }

  removeFriend(userId: string, friendId: string): boolean {
    const db = this.storage.getDb();
    const r1 = db.prepare('DELETE FROM friendships WHERE user_id = ? AND friend_id = ?').run(userId, friendId);
    const r2 = db.prepare('DELETE FROM friendships WHERE user_id = ? AND friend_id = ?').run(friendId, userId);
    return (r1.changes + r2.changes) > 0;
  }
}
