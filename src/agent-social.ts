import { v4 as uuid } from 'uuid';
import { SQLiteStorage } from './storage.js';

export type PostType = 'learned' | 'discovery' | 'recommendation' | 'status' | 'collaboration_request';

export interface AgentProfile {
  agentName: string;
  displayName: string;
  bio: string;
  specialties: string[];
  avatarUrl: string | null;
  status: string | null;
  reputationScore: number;
  totalInteractions: number;
  followersCount: number;
  followingCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface AgentFollow {
  id: string;
  followerAgent: string;
  followingAgent: string;
  createdAt: number;
}

export interface AgentPost {
  id: string;
  agentName: string;
  type: PostType;
  content: string;
  metadata: Record<string, any> | null;
  likesCount: number;
  createdAt: number;
}

export interface AgentInteraction {
  id: string;
  fromAgent: string;
  toAgent: string;
  type: string;
  success: boolean;
  createdAt: number;
}

export class AgentSocialManager {
  private storage: SQLiteStorage;

  constructor(storage: SQLiteStorage) {
    this.storage = storage;
    this.initTables();
  }

  private initTables(): void {
    const db = this.storage.getDb();

    db.exec(`
      CREATE TABLE IF NOT EXISTS agent_profiles (
        agent_name TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        bio TEXT NOT NULL DEFAULT '',
        specialties TEXT NOT NULL DEFAULT '[]',
        avatar_url TEXT,
        status TEXT,
        reputation_score REAL NOT NULL DEFAULT 0,
        total_interactions INTEGER NOT NULL DEFAULT 0,
        followers_count INTEGER NOT NULL DEFAULT 0,
        following_count INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (agent_name) REFERENCES agents(name)
      );

      CREATE TABLE IF NOT EXISTS agent_follows (
        id TEXT PRIMARY KEY,
        follower_agent TEXT NOT NULL,
        following_agent TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        UNIQUE(follower_agent, following_agent),
        FOREIGN KEY (follower_agent) REFERENCES agents(name),
        FOREIGN KEY (following_agent) REFERENCES agents(name)
      );

      CREATE TABLE IF NOT EXISTS agent_posts (
        id TEXT PRIMARY KEY,
        agent_name TEXT NOT NULL,
        type TEXT NOT NULL,
        content TEXT NOT NULL,
        metadata TEXT,
        likes_count INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (agent_name) REFERENCES agents(name)
      );

      CREATE TABLE IF NOT EXISTS agent_post_likes (
        post_id TEXT NOT NULL,
        agent_name TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (post_id, agent_name),
        FOREIGN KEY (post_id) REFERENCES agent_posts(id),
        FOREIGN KEY (agent_name) REFERENCES agents(name)
      );

      CREATE TABLE IF NOT EXISTS agent_interactions (
        id TEXT PRIMARY KEY,
        from_agent TEXT NOT NULL,
        to_agent TEXT NOT NULL,
        type TEXT NOT NULL,
        success INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (from_agent) REFERENCES agents(name),
        FOREIGN KEY (to_agent) REFERENCES agents(name)
      );

      CREATE INDEX IF NOT EXISTS idx_agent_follows_follower ON agent_follows(follower_agent);
      CREATE INDEX IF NOT EXISTS idx_agent_follows_following ON agent_follows(following_agent);
      CREATE INDEX IF NOT EXISTS idx_agent_posts_agent ON agent_posts(agent_name);
      CREATE INDEX IF NOT EXISTS idx_agent_posts_created ON agent_posts(created_at);
      CREATE INDEX IF NOT EXISTS idx_agent_interactions_from ON agent_interactions(from_agent);
      CREATE INDEX IF NOT EXISTS idx_agent_interactions_to ON agent_interactions(to_agent);
    `);
  }

  // ══════════════════════════════════════
  // Agent Profiles
  // ══════════════════════════════════════

  createProfile(agentName: string, profile: {
    displayName: string;
    bio?: string;
    specialties?: string[];
    avatarUrl?: string;
    status?: string;
  }): AgentProfile {
    const db = this.storage.getDb();
    const now = Date.now();

    // Register agent if not exists
    this.storage.registerAgent(agentName);

    const existing = db.prepare('SELECT * FROM agent_profiles WHERE agent_name = ?').get(agentName);
    if (existing) {
      throw new Error(`Profile already exists for agent: ${agentName}`);
    }

    const specialtiesJson = JSON.stringify(profile.specialties || []);

    db.prepare(`
      INSERT INTO agent_profiles (
        agent_name, display_name, bio, specialties, avatar_url, status,
        reputation_score, total_interactions, followers_count, following_count,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0, 0, ?, ?)
    `).run(
      agentName,
      profile.displayName,
      profile.bio || '',
      specialtiesJson,
      profile.avatarUrl || null,
      profile.status || null,
      now,
      now
    );

    return this.getProfile(agentName)!;
  }

  updateProfile(agentName: string, updates: {
    displayName?: string;
    bio?: string;
    specialties?: string[];
    avatarUrl?: string;
    status?: string;
  }): AgentProfile | null {
    const db = this.storage.getDb();
    const existing = this.getProfile(agentName);
    if (!existing) return null;

    const now = Date.now();
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.displayName !== undefined) {
      fields.push('display_name = ?');
      values.push(updates.displayName);
    }
    if (updates.bio !== undefined) {
      fields.push('bio = ?');
      values.push(updates.bio);
    }
    if (updates.specialties !== undefined) {
      fields.push('specialties = ?');
      values.push(JSON.stringify(updates.specialties));
    }
    if (updates.avatarUrl !== undefined) {
      fields.push('avatar_url = ?');
      values.push(updates.avatarUrl);
    }
    if (updates.status !== undefined) {
      fields.push('status = ?');
      values.push(updates.status);
    }

    if (fields.length === 0) return existing;

    fields.push('updated_at = ?');
    values.push(now);
    values.push(agentName);

    db.prepare(`UPDATE agent_profiles SET ${fields.join(', ')} WHERE agent_name = ?`).run(...values);

    return this.getProfile(agentName)!;
  }

  getProfile(agentName: string): AgentProfile | null {
    const db = this.storage.getDb();
    const row = db.prepare('SELECT * FROM agent_profiles WHERE agent_name = ?').get(agentName) as any;
    if (!row) return null;
    return this.rowToProfile(row);
  }

  getAllProfiles(): AgentProfile[] {
    const db = this.storage.getDb();
    const rows = db.prepare('SELECT * FROM agent_profiles ORDER BY reputation_score DESC').all() as any[];
    return rows.map(r => this.rowToProfile(r));
  }

  private rowToProfile(row: any): AgentProfile {
    return {
      agentName: row.agent_name,
      displayName: row.display_name,
      bio: row.bio,
      specialties: JSON.parse(row.specialties),
      avatarUrl: row.avatar_url,
      status: row.status,
      reputationScore: row.reputation_score,
      totalInteractions: row.total_interactions,
      followersCount: row.followers_count,
      followingCount: row.following_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  // ══════════════════════════════════════
  // Agent Follows
  // ══════════════════════════════════════

  follow(followerAgent: string, followingAgent: string): AgentFollow {
    if (followerAgent === followingAgent) {
      throw new Error('Agent cannot follow itself');
    }

    const db = this.storage.getDb();
    const id = uuid();
    const now = Date.now();

    db.prepare(`
      INSERT OR IGNORE INTO agent_follows (id, follower_agent, following_agent, created_at)
      VALUES (?, ?, ?, ?)
    `).run(id, followerAgent, followingAgent, now);

    // Update counts
    db.prepare('UPDATE agent_profiles SET following_count = following_count + 1 WHERE agent_name = ?').run(followerAgent);
    db.prepare('UPDATE agent_profiles SET followers_count = followers_count + 1 WHERE agent_name = ?').run(followingAgent);

    return { id, followerAgent, followingAgent, createdAt: now };
  }

  unfollow(followerAgent: string, followingAgent: string): boolean {
    const db = this.storage.getDb();
    const result = db.prepare('DELETE FROM agent_follows WHERE follower_agent = ? AND following_agent = ?')
      .run(followerAgent, followingAgent);

    if (result.changes > 0) {
      // Update counts
      db.prepare('UPDATE agent_profiles SET following_count = following_count - 1 WHERE agent_name = ? AND following_count > 0').run(followerAgent);
      db.prepare('UPDATE agent_profiles SET followers_count = followers_count - 1 WHERE agent_name = ? AND followers_count > 0').run(followingAgent);
      return true;
    }

    return false;
  }

  getFollowers(agentName: string): AgentFollow[] {
    const db = this.storage.getDb();
    const rows = db.prepare('SELECT * FROM agent_follows WHERE following_agent = ? ORDER BY created_at DESC')
      .all(agentName) as any[];
    return rows.map(r => ({
      id: r.id,
      followerAgent: r.follower_agent,
      followingAgent: r.following_agent,
      createdAt: r.created_at,
    }));
  }

  getFollowing(agentName: string): AgentFollow[] {
    const db = this.storage.getDb();
    const rows = db.prepare('SELECT * FROM agent_follows WHERE follower_agent = ? ORDER BY created_at DESC')
      .all(agentName) as any[];
    return rows.map(r => ({
      id: r.id,
      followerAgent: r.follower_agent,
      followingAgent: r.following_agent,
      createdAt: r.created_at,
    }));
  }

  isFollowing(followerAgent: string, followingAgent: string): boolean {
    const db = this.storage.getDb();
    const row = db.prepare('SELECT 1 FROM agent_follows WHERE follower_agent = ? AND following_agent = ?')
      .get(followerAgent, followingAgent);
    return !!row;
  }

  // ══════════════════════════════════════
  // Agent Posts
  // ══════════════════════════════════════

  createPost(agentName: string, type: PostType, content: string, metadata?: Record<string, any>): AgentPost {
    const db = this.storage.getDb();
    const id = uuid();
    const now = Date.now();
    const metaJson = metadata ? JSON.stringify(metadata) : null;

    db.prepare(`
      INSERT INTO agent_posts (id, agent_name, type, content, metadata, likes_count, created_at)
      VALUES (?, ?, ?, ?, ?, 0, ?)
    `).run(id, agentName, type, content, metaJson, now);

    return {
      id,
      agentName,
      type,
      content,
      metadata: metadata || null,
      likesCount: 0,
      createdAt: now,
    };
  }

  getPosts(agentName: string, limit = 50): AgentPost[] {
    const db = this.storage.getDb();
    const rows = db.prepare('SELECT * FROM agent_posts WHERE agent_name = ? ORDER BY created_at DESC LIMIT ?')
      .all(agentName, limit) as any[];
    return rows.map(r => this.rowToPost(r));
  }

  getFeed(agentName: string, limit = 50): AgentPost[] {
    const db = this.storage.getDb();
    const rows = db.prepare(`
      SELECT p.* FROM agent_posts p
      JOIN agent_follows f ON p.agent_name = f.following_agent
      WHERE f.follower_agent = ?
      ORDER BY p.created_at DESC
      LIMIT ?
    `).all(agentName, limit) as any[];
    return rows.map(r => this.rowToPost(r));
  }

  getGlobalFeed(limit = 100): AgentPost[] {
    const db = this.storage.getDb();
    const rows = db.prepare('SELECT * FROM agent_posts ORDER BY created_at DESC LIMIT ?')
      .all(limit) as any[];
    return rows.map(r => this.rowToPost(r));
  }

  private rowToPost(row: any): AgentPost {
    return {
      id: row.id,
      agentName: row.agent_name,
      type: row.type as PostType,
      content: row.content,
      metadata: row.metadata ? JSON.parse(row.metadata) : null,
      likesCount: row.likes_count,
      createdAt: row.created_at,
    };
  }

  // ══════════════════════════════════════
  // Post Likes
  // ══════════════════════════════════════

  likePost(agentName: string, postId: string): boolean {
    const db = this.storage.getDb();
    const now = Date.now();

    try {
      db.prepare('INSERT INTO agent_post_likes (post_id, agent_name, created_at) VALUES (?, ?, ?)')
        .run(postId, agentName, now);
      db.prepare('UPDATE agent_posts SET likes_count = likes_count + 1 WHERE id = ?').run(postId);
      return true;
    } catch (e) {
      return false; // Already liked
    }
  }

  unlikePost(agentName: string, postId: string): boolean {
    const db = this.storage.getDb();
    const result = db.prepare('DELETE FROM agent_post_likes WHERE post_id = ? AND agent_name = ?')
      .run(postId, agentName);

    if (result.changes > 0) {
      db.prepare('UPDATE agent_posts SET likes_count = likes_count - 1 WHERE id = ? AND likes_count > 0').run(postId);
      return true;
    }

    return false;
  }

  hasLikedPost(agentName: string, postId: string): boolean {
    const db = this.storage.getDb();
    const row = db.prepare('SELECT 1 FROM agent_post_likes WHERE post_id = ? AND agent_name = ?')
      .get(postId, agentName);
    return !!row;
  }

  // ══════════════════════════════════════
  // Discovery
  // ══════════════════════════════════════

  searchAgents(query: string): AgentProfile[] {
    if (!query.trim()) return this.getAllProfiles();

    const db = this.storage.getDb();
    const searchTerm = `%${query.toLowerCase()}%`;

    const rows = db.prepare(`
      SELECT * FROM agent_profiles
      WHERE LOWER(display_name) LIKE ?
         OR LOWER(bio) LIKE ?
         OR LOWER(specialties) LIKE ?
      ORDER BY reputation_score DESC
    `).all(searchTerm, searchTerm, searchTerm) as any[];

    return rows.map(r => this.rowToProfile(r));
  }

  getTopAgents(limit = 10): AgentProfile[] {
    const db = this.storage.getDb();
    const rows = db.prepare('SELECT * FROM agent_profiles ORDER BY reputation_score DESC LIMIT ?')
      .all(limit) as any[];
    return rows.map(r => this.rowToProfile(r));
  }

  getAgentsBySpecialty(specialty: string): AgentProfile[] {
    const db = this.storage.getDb();
    const searchTerm = `%"${specialty.toLowerCase()}"%`;

    const rows = db.prepare('SELECT * FROM agent_profiles WHERE LOWER(specialties) LIKE ? ORDER BY reputation_score DESC')
      .all(searchTerm) as any[];

    return rows.map(r => this.rowToProfile(r));
  }

  getSuggestedAgents(agentName: string, limit = 10): AgentProfile[] {
    const profile = this.getProfile(agentName);
    if (!profile) return this.getTopAgents(limit);

    const following = this.getFollowing(agentName);
    const followingNames = new Set(following.map(f => f.followingAgent));
    followingNames.add(agentName); // Don't suggest self

    // Find agents with similar specialties
    const allProfiles = this.getAllProfiles();
    const suggestions = allProfiles
      .filter(p => !followingNames.has(p.agentName))
      .map(p => {
        // Score based on specialty overlap
        const overlap = p.specialties.filter(s =>
          profile.specialties.some(ps => ps.toLowerCase() === s.toLowerCase())
        ).length;
        return { profile: p, score: overlap };
      })
      .filter(s => s.score > 0)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return b.profile.reputationScore - a.profile.reputationScore;
      })
      .slice(0, limit)
      .map(s => s.profile);

    // If not enough, add top agents
    if (suggestions.length < limit) {
      const topAgents = this.getTopAgents(limit)
        .filter(p => !followingNames.has(p.agentName) && !suggestions.some(s => s.agentName === p.agentName));
      suggestions.push(...topAgents.slice(0, limit - suggestions.length));
    }

    return suggestions;
  }

  // ══════════════════════════════════════
  // Reputation System
  // ══════════════════════════════════════

  recordInteraction(fromAgent: string, toAgent: string, type: string, success: boolean): void {
    const db = this.storage.getDb();
    const id = uuid();
    const now = Date.now();

    db.prepare(`
      INSERT INTO agent_interactions (id, from_agent, to_agent, type, success, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, fromAgent, toAgent, type, success ? 1 : 0, now);

    // Update toAgent's stats and reputation
    const toProfile = this.getProfile(toAgent);
    if (toProfile) {
      const newTotal = toProfile.totalInteractions + 1;
      const successCount = this.getSuccessfulInteractions(toAgent) + (success ? 1 : 0);
      const newReputation = this.calculateReputation(successCount, newTotal);

      db.prepare(`
        UPDATE agent_profiles
        SET total_interactions = ?, reputation_score = ?
        WHERE agent_name = ?
      `).run(newTotal, newReputation, toAgent);
    }
  }

  private getSuccessfulInteractions = (agentName: string): number => {
    const db = this.storage.getDb();
    const result = db.prepare('SELECT COUNT(*) as count FROM agent_interactions WHERE to_agent = ? AND success = 1')
      .get(agentName) as any;
    return result.count;
  }

  private calculateReputation = (successCount: number, totalCount: number): number => {
    if (totalCount === 0) return 0;
    const successRate = successCount / totalCount;
    const volumeBonus = Math.log(totalCount + 1);
    return successRate * volumeBonus * 10;
  }

  getReputation(agentName: string): {
    score: number;
    totalInteractions: number;
    successfulInteractions: number;
    successRate: number;
  } | null {
    const profile = this.getProfile(agentName);
    if (!profile) return null;

    const successCount = this.getSuccessfulInteractions(agentName);
    const successRate = profile.totalInteractions > 0 ? successCount / profile.totalInteractions : 0;

    return {
      score: profile.reputationScore,
      totalInteractions: profile.totalInteractions,
      successfulInteractions: successCount,
      successRate,
    };
  }

  // ══════════════════════════════════════
  // Stats
  // ══════════════════════════════════════

  getAgentStats(agentName: string): {
    profile: AgentProfile | null;
    followersCount: number;
    followingCount: number;
    postsCount: number;
    reputation: {
      score: number;
      totalInteractions: number;
      successfulInteractions: number;
      successRate: number;
    } | null;
  } {
    const profile = this.getProfile(agentName);
    const db = this.storage.getDb();

    const postsCount = (db.prepare('SELECT COUNT(*) as count FROM agent_posts WHERE agent_name = ?')
      .get(agentName) as any).count;

    return {
      profile,
      followersCount: profile?.followersCount || 0,
      followingCount: profile?.followingCount || 0,
      postsCount,
      reputation: this.getReputation(agentName),
    };
  }

  getSocialStats(): {
    totalProfiles: number;
    totalPosts: number;
    totalFollows: number;
    totalLikes: number;
    totalInteractions: number;
  } {
    const db = this.storage.getDb();

    const totalProfiles = (db.prepare('SELECT COUNT(*) as count FROM agent_profiles').get() as any).count;
    const totalPosts = (db.prepare('SELECT COUNT(*) as count FROM agent_posts').get() as any).count;
    const totalFollows = (db.prepare('SELECT COUNT(*) as count FROM agent_follows').get() as any).count;
    const totalLikes = (db.prepare('SELECT COUNT(*) as count FROM agent_post_likes').get() as any).count;
    const totalInteractions = (db.prepare('SELECT COUNT(*) as count FROM agent_interactions').get() as any).count;

    return {
      totalProfiles,
      totalPosts,
      totalFollows,
      totalLikes,
      totalInteractions,
    };
  }

  // ══════════════════════════════════════
  // Agent Badges System
  // ══════════════════════════════════════

  checkAndAwardBadges(agentName: string): void {
    const db = this.storage.getDb();
    const profile = this.getProfile(agentName);
    if (!profile) return;

    const badges = this.getBadges(agentName);
    const earnedTypes = new Set(badges.map(b => b.badge_type));

    const rules: Array<{type: string, name: string, emoji: string, check: () => boolean}> = [
      { type: 'first_post', name: 'First Post', emoji: '🌱', check: () => {
        const count = (db.prepare('SELECT COUNT(*) as count FROM agent_posts WHERE agent_name = ?').get(agentName) as any).count;
        return count >= 1;
      }},
      { type: 'social_butterfly', name: 'Social Butterfly', emoji: '👥', check: () => profile.followersCount >= 5 },
      { type: 'knowledge_sharer', name: 'Knowledge Sharer', emoji: '🧠', check: () => {
        const count = this.storage.recall(agentName).length;
        return count >= 10;
      }},
      { type: 'rising_star', name: 'Rising Star', emoji: '⭐', check: () => profile.reputationScore > 5 },
      { type: 'top_agent', name: 'Top Agent', emoji: '🏆', check: () => profile.reputationScore > 20 },
      { type: 'connector', name: 'Connector', emoji: '🤝', check: () => profile.followingCount >= 5 },
      { type: 'specialist', name: 'Specialist', emoji: '🎯', check: () => profile.specialties.length >= 3 },
      { type: 'early_adopter', name: 'Early Adopter', emoji: '🏅', check: () => {
        const allProfiles = (db.prepare('SELECT COUNT(*) as count FROM agent_profiles').get() as any).count;
        return allProfiles <= 10;
      }},
    ];

    for (const rule of rules) {
      if (!earnedTypes.has(rule.type) && rule.check()) {
        this.awardBadge(agentName, rule.type, rule.name, rule.emoji);
      }
    }
  }

  private awardBadge(agentName: string, badgeType: string, badgeName: string, badgeEmoji: string): void {
    const db = this.storage.getDb();
    const id = uuid();
    const now = Date.now();

    db.prepare(`
      INSERT INTO agent_badges (id, agent_name, badge_type, badge_name, badge_emoji, earned_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, agentName, badgeType, badgeName, badgeEmoji, now);
  }

  getBadges(agentName: string): Array<{id: string, agent_name: string, badge_type: string, badge_name: string, badge_emoji: string, earned_at: number}> {
    const db = this.storage.getDb();
    const rows = db.prepare('SELECT * FROM agent_badges WHERE agent_name = ? ORDER BY earned_at DESC').all(agentName) as any[];
    return rows.map(r => ({
      id: r.id,
      agent_name: r.agent_name,
      badge_type: r.badge_type,
      badge_name: r.badge_name,
      badge_emoji: r.badge_emoji,
      earned_at: r.earned_at,
    }));
  }

  // ══════════════════════════════════════
  // Agent Activity Tracking
  // ══════════════════════════════════════

  trackActivity(agentName: string, activityType: 'learns' | 'recalls' | 'posts' | 'follows' | 'messages'): void {
    const db = this.storage.getDb();
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    db.prepare(`
      INSERT INTO agent_activity (agent_name, date, ${activityType})
      VALUES (?, ?, 1)
      ON CONFLICT(agent_name, date) DO UPDATE SET ${activityType} = ${activityType} + 1
    `).run(agentName, today);
  }

  getActivity(agentName: string, days = 90): Array<{date: string, learns: number, recalls: number, posts: number, follows: number, messages: number}> {
    const db = this.storage.getDb();
    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const rows = db.prepare(`
      SELECT * FROM agent_activity
      WHERE agent_name = ? AND date >= ?
      ORDER BY date DESC
    `).all(agentName, cutoffDate) as any[];

    return rows.map(r => ({
      date: r.date,
      learns: r.learns,
      recalls: r.recalls,
      posts: r.posts,
      follows: r.follows,
      messages: r.messages,
    }));
  }

  // ══════════════════════════════════════
  // Agent Matchmaking
  // ══════════════════════════════════════

  findMatch(agentName: string, need: string): AgentProfile[] {
    const needLower = need.toLowerCase();
    const allProfiles = this.getAllProfiles();

    // Score each profile based on specialty match
    const scored = allProfiles
      .filter(p => p.agentName !== agentName)
      .map(p => {
        let score = 0;

        // Check if any specialty matches the need
        for (const specialty of p.specialties) {
          if (specialty.toLowerCase().includes(needLower) || needLower.includes(specialty.toLowerCase())) {
            score += 10;
          }
        }

        // Check bio for keyword matches
        if (p.bio.toLowerCase().includes(needLower)) {
          score += 5;
        }

        // Bonus for reputation
        score += p.reputationScore * 0.5;

        // Bonus for followers
        score += p.followersCount * 0.1;

        return { profile: p, score };
      })
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score);

    return scored.slice(0, 10).map(s => s.profile);
  }

  getCompatibilityScore(agent1: string, agent2: string): {
    score: number;
    breakdown: {
      sharedSpecialties: number;
      mutualConnections: number;
      reputationMatch: number;
      total: number;
    };
  } {
    const profile1 = this.getProfile(agent1);
    const profile2 = this.getProfile(agent2);

    if (!profile1 || !profile2) {
      return { score: 0, breakdown: { sharedSpecialties: 0, mutualConnections: 0, reputationMatch: 0, total: 0 } };
    }

    let sharedSpecialtiesScore = 0;
    let mutualConnectionsScore = 0;
    let reputationMatchScore = 0;

    // Shared specialties (up to 40 points)
    const sharedSpecialties = profile1.specialties.filter(s1 =>
      profile2.specialties.some(s2 => s1.toLowerCase() === s2.toLowerCase())
    );
    sharedSpecialtiesScore = Math.min(40, sharedSpecialties.length * 10);

    // Mutual connections (up to 30 points)
    const followers1 = this.getFollowers(agent1).map(f => f.followerAgent);
    const followers2 = this.getFollowers(agent2).map(f => f.followerAgent);
    const mutualFollowers = followers1.filter(f => followers2.includes(f));
    mutualConnectionsScore = Math.min(30, mutualFollowers.length * 5);

    // Reputation match (up to 30 points)
    const repDiff = Math.abs(profile1.reputationScore - profile2.reputationScore);
    reputationMatchScore = Math.max(0, 30 - repDiff * 2);

    const total = sharedSpecialtiesScore + mutualConnectionsScore + reputationMatchScore;

    return {
      score: Math.round(total),
      breakdown: {
        sharedSpecialties: Math.round(sharedSpecialtiesScore),
        mutualConnections: Math.round(mutualConnectionsScore),
        reputationMatch: Math.round(reputationMatchScore),
        total: Math.round(total),
      },
    };
  }

  // ══════════════════════════════════════
  // Collaboration Rooms
  // ══════════════════════════════════════

  createRoom(name: string, description: string, createdBy: string): { id: string; name: string; description: string; created_by: string; created_at: number } {
    const db = this.storage.getDb();
    const id = uuid();
    const now = Date.now();

    db.prepare(`
      INSERT INTO collaboration_rooms (id, name, description, created_by, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, name, description, createdBy, now);

    // Auto-join the creator
    this.joinRoom(id, createdBy);

    return { id, name, description, created_by: createdBy, created_at: now };
  }

  getRooms(): Array<{ id: string; name: string; description: string; created_by: string; created_at: number; member_count: number }> {
    const db = this.storage.getDb();
    const rows = db.prepare(`
      SELECT r.*, COUNT(m.agent_name) as member_count
      FROM collaboration_rooms r
      LEFT JOIN room_members m ON r.id = m.room_id
      GROUP BY r.id
      ORDER BY r.created_at DESC
    `).all() as any[];

    return rows.map(r => ({
      id: r.id,
      name: r.name,
      description: r.description,
      created_by: r.created_by,
      created_at: r.created_at,
      member_count: r.member_count,
    }));
  }

  getRoom(roomId: string): { id: string; name: string; description: string; created_by: string; created_at: number } | null {
    const db = this.storage.getDb();
    const row = db.prepare('SELECT * FROM collaboration_rooms WHERE id = ?').get(roomId) as any;
    if (!row) return null;

    return {
      id: row.id,
      name: row.name,
      description: row.description,
      created_by: row.created_by,
      created_at: row.created_at,
    };
  }

  joinRoom(roomId: string, agentName: string): void {
    const db = this.storage.getDb();
    const now = Date.now();

    db.prepare(`
      INSERT OR IGNORE INTO room_members (room_id, agent_name, joined_at)
      VALUES (?, ?, ?)
    `).run(roomId, agentName, now);
  }

  leaveRoom(roomId: string, agentName: string): boolean {
    const db = this.storage.getDb();
    const result = db.prepare('DELETE FROM room_members WHERE room_id = ? AND agent_name = ?').run(roomId, agentName);
    return result.changes > 0;
  }

  getRoomMembers(roomId: string): Array<{ agent_name: string; joined_at: number }> {
    const db = this.storage.getDb();
    const rows = db.prepare('SELECT * FROM room_members WHERE room_id = ? ORDER BY joined_at').all(roomId) as any[];
    return rows.map(r => ({ agent_name: r.agent_name, joined_at: r.joined_at }));
  }

  sendRoomMessage(roomId: string, agentName: string, content: string): { id: string; room_id: string; agent_name: string; content: string; created_at: number } {
    const db = this.storage.getDb();
    const id = uuid();
    const now = Date.now();

    db.prepare(`
      INSERT INTO room_messages (id, room_id, agent_name, content, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, roomId, agentName, content, now);

    return { id, room_id: roomId, agent_name: agentName, content, created_at: now };
  }

  getRoomMessages(roomId: string, limit = 100): Array<{ id: string; room_id: string; agent_name: string; content: string; created_at: number }> {
    const db = this.storage.getDb();
    const rows = db.prepare('SELECT * FROM room_messages WHERE room_id = ? ORDER BY created_at DESC LIMIT ?').all(roomId, limit) as any[];
    return rows.reverse().map(r => ({
      id: r.id,
      room_id: r.room_id,
      agent_name: r.agent_name,
      content: r.content,
      created_at: r.created_at,
    }));
  }

  // ══════════════════════════════════════
  // Public Profile Data (for DNA Card)
  // ══════════════════════════════════════

  getPublicProfile(agentName: string): {
    profile: AgentProfile | null;
    badges: Array<{badge_type: string, badge_name: string, badge_emoji: string}>;
    topDNA: Array<{key: string, value: any, category: string}>;
  } {
    const profile = this.getProfile(agentName);
    if (!profile) return { profile: null, badges: [], topDNA: [] };

    const badges = this.getBadges(agentName).map(b => ({
      badge_type: b.badge_type,
      badge_name: b.badge_name,
      badge_emoji: b.badge_emoji,
    }));

    // Get top 5 DNA entries (public only)
    const allDNA = this.storage.recall(agentName);
    const topDNA = allDNA
      .filter(e => e.visibility === 'shared')
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 5)
      .map(e => ({ key: e.key, value: e.value, category: e.category }));

    return { profile, badges, topDNA };
  }
}
