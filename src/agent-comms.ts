import { v4 as uuid } from 'uuid';
import { SQLiteStorage } from './storage.js';
import { SocialManager } from './social.js';
import { UserProfileManager } from './user-profiles.js';
import { FeedManager } from './feed.js';

export type MessageType = 'recommendation' | 'request' | 'alert' | 'info';

export interface AgentMessage {
  id: string;
  fromAgent: string;
  toAgent: string;
  fromUser: string;
  toUser: string;
  type: MessageType;
  content: string;
  timestamp: number;
  read: boolean;
}

export class AgentCommsManager {
  private storage: SQLiteStorage;
  private social: SocialManager;
  private profiles: UserProfileManager;
  private feed: FeedManager;

  constructor(
    storage: SQLiteStorage,
    social: SocialManager,
    profiles: UserProfileManager,
    feed: FeedManager
  ) {
    this.storage = storage;
    this.social = social;
    this.profiles = profiles;
    this.feed = feed;
  }

  sendMessage(
    fromAgent: string,
    toAgent: string,
    type: MessageType,
    content: string
  ): AgentMessage {
    const db = this.storage.getDb();

    // Resolve owners
    const fromUser = this.profiles.getAgentOwner(fromAgent);
    const toUser = this.profiles.getAgentOwner(toAgent);

    if (!fromUser) throw new Error(`Agent "${fromAgent}" has no registered owner`);
    if (!toUser) throw new Error(`Agent "${toAgent}" has no registered owner`);

    // Same user's agents can always communicate
    if (fromUser.id !== toUser.id) {
      // Cross-user: require friendship
      if (!this.social.areFriends(fromUser.id, toUser.id)) {
        throw new Error(
          `Cannot send message: ${fromUser.name} and ${toUser.name} are not friends`
        );
      }
    }

    const id = uuid();
    const now = Date.now();

    db.prepare(`
      INSERT INTO messages (id, from_agent, to_agent, from_user, to_user, type, content, timestamp, read)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
    `).run(id, fromAgent, toAgent, fromUser.id, toUser.id, type, content, now);

    const msg: AgentMessage = {
      id,
      fromAgent,
      toAgent,
      fromUser: fromUser.id,
      toUser: toUser.id,
      type,
      content,
      timestamp: now,
      read: false,
    };

    // Add to receiver's feed
    this.feed.addItem(
      toUser.id,
      'friend_agent_message',
      fromAgent,
      `${fromAgent} → ${toAgent}: ${content}`,
      { messageId: id, type, fromUser: fromUser.name }
    );

    return msg;
  }

  getMessagesForUser(userId: string): AgentMessage[] {
    const db = this.storage.getDb();
    const rows = db.prepare(
      'SELECT * FROM messages WHERE to_user = ? ORDER BY timestamp DESC'
    ).all(userId) as any[];
    return rows.map(r => this.rowToMessage(r));
  }

  getMessagesBetweenAgents(agent1: string, agent2: string): AgentMessage[] {
    const db = this.storage.getDb();
    const rows = db.prepare(`
      SELECT * FROM messages
      WHERE (from_agent = ? AND to_agent = ?) OR (from_agent = ? AND to_agent = ?)
      ORDER BY timestamp ASC
    `).all(agent1, agent2, agent2, agent1) as any[];
    return rows.map(r => this.rowToMessage(r));
  }

  getAllMessages(): AgentMessage[] {
    const db = this.storage.getDb();
    const rows = db.prepare('SELECT * FROM messages ORDER BY timestamp DESC').all() as any[];
    return rows.map(r => this.rowToMessage(r));
  }

  private rowToMessage(row: any): AgentMessage {
    return {
      id: row.id,
      fromAgent: row.from_agent,
      toAgent: row.to_agent,
      fromUser: row.from_user,
      toUser: row.to_user,
      type: row.type as MessageType,
      content: row.content,
      timestamp: row.timestamp,
      read: !!row.read,
    };
  }
}
