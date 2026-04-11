import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import { SQLiteStorage, Category, Visibility } from './storage.js';
import { UserProfileManager } from './user-profiles.js';
import { SocialManager } from './social.js';
import { FeedManager } from './feed.js';
import { AgentCommsManager, MessageType } from './agent-comms.js';
import { AuthManager, AuthUser } from './auth.js';
import { AgentSocialManager, PostType } from './agent-social.js';
import { CloneManager } from './clone.js';

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function createServer(storage?: SQLiteStorage, port = 3456) {
  const store = storage || new SQLiteStorage();
  const app = express();

  // Social managers
  const profiles = new UserProfileManager(store);
  const social = new SocialManager(store);
  const feed = new FeedManager(store);
  const comms = new AgentCommsManager(store, social, profiles, feed);
  const auth = new AuthManager(store, process.env.JWT_SECRET);
  const agentSocial = new AgentSocialManager(store);
  const cloneManager = new CloneManager(store);

  app.use(cors());
  app.use(express.json());
  app.use(express.static(path.join(__dirname, '..', 'public')));

  // ══════════════════════════════════════
  // Auth Middleware
  // ══════════════════════════════════════

  const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
    // Auth temporarily disabled for development
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const user = auth.getUserFromToken(token);
      if (user) {
        req.user = user;
      }
    }
    next();
  };

  // ══════════════════════════════════════
  // Auth Endpoints (Public)
  // ══════════════════════════════════════

  app.post('/api/auth/register', async (req, res) => {
    try {
      const { email, password, name } = req.body;
      if (!email || !password || !name) {
        return res.status(400).json({ error: 'email, password, and name are required' });
      }

      const result = await auth.register(email, password, name);
      res.json({
        ok: true,
        user: {
          id: result.user.id,
          email: result.user.email,
          name: result.user.name,
          userId: result.user.userId,
        },
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ error: 'email and password are required' });
      }

      const result = await auth.login(email, password);
      res.json({
        ok: true,
        user: {
          id: result.user.id,
          email: result.user.email,
          name: result.user.name,
          userId: result.user.userId,
        },
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
      });
    } catch (err: any) {
      res.status(401).json({ error: err.message });
    }
  });

  app.post('/api/auth/refresh', async (req, res) => {
    try {
      const { refreshToken } = req.body;
      if (!refreshToken) {
        return res.status(400).json({ error: 'refreshToken is required' });
      }

      const result = await auth.refreshToken(refreshToken);
      res.json({
        ok: true,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
      });
    } catch (err: any) {
      res.status(401).json({ error: err.message });
    }
  });

  app.post('/api/auth/logout', async (req, res) => {
    try {
      const { refreshToken } = req.body;
      if (refreshToken) {
        await auth.logout(refreshToken);
      }
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/auth/me', authMiddleware, (req, res) => {
    res.json({
      ok: true,
      user: {
        id: req.user!.id,
        email: req.user!.email,
        name: req.user!.name,
        userId: req.user!.userId,
      },
    });
  });

  // ══════════════════════════════════════
  // Original DNA endpoints
  // ══════════════════════════════════════

  // ── Register Agent (Protected) ──
  app.post('/api/agents/register', authMiddleware, (req, res) => {
    try {
      const { name } = req.body;
      if (!name || typeof name !== 'string') {
        return res.status(400).json({ error: 'Agent name is required' });
      }
      const agent = store.registerAgent(name);

      // Link agent to authenticated user
      profiles.registerAgentForUser(req.user!.userId, name);

      // Auto-create clone for this agent
      try {
        cloneManager.createClone(name, req.user!.userId);
      } catch (err) {
        // Clone might already exist, ignore
      }

      res.json({ ok: true, agent });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Self-Register (Protected) ──
  app.post('/api/agents/self-register', authMiddleware, (req, res) => {
    try {
      const { agent, initialDNA } = req.body;
      if (!agent || typeof agent !== 'string') {
        return res.status(400).json({ error: 'agent name is required' });
      }

      // 1. Register the agent
      const agentRecord = store.registerAgent(agent);

      // 2. Link to authenticated user
      const userId = req.user!.userId;
      const user = profiles.getUser(userId);
      if (!user) return res.status(404).json({ error: 'User not found' });
      profiles.registerAgentForUser(userId, agent);
      feed.addItem(userId, 'system', agent, `Agent "${agent}" self-registered and joined your profile`);

      // 3. Seed initial DNA entries
      let entriesAdded = 0;
      if (Array.isArray(initialDNA)) {
        for (const entry of initialDNA) {
          if (entry.category && entry.key && entry.value !== undefined) {
            store.learn(entry.category, entry.key, entry.value, agent, {
              confidence: entry.confidence,
              visibility: entry.visibility,
            });
            entriesAdded++;
          }
        }
      }

      // 4. Onboard — get back everything the agent can see
      const onboarded = store.onboard(agent);

      // 5. Auto-create clone for this agent
      try {
        cloneManager.createClone(agent, userId);
      } catch (err) {
        // Clone might already exist, ignore
      }

      res.json({
        ok: true,
        agent: agentRecord,
        user: user || undefined,
        profile: onboarded.profile,
        summary: onboarded.summary,
        entriesAdded,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Learn (Protected) ──
  app.post('/api/learn', authMiddleware, (req, res) => {
    try {
      const { agent, category, key, value, confidence, visibility, visibleTo } = req.body;
      if (!agent || !category || !key || value === undefined) {
        return res.status(400).json({ error: 'Missing required fields: agent, category, key, value' });
      }

      // Verify agent belongs to authenticated user
      const userAgents = profiles.getUserAgents(req.user!.userId);
      if (!userAgents.includes(agent)) {
        return res.status(403).json({ error: 'Agent does not belong to authenticated user' });
      }

      const entry = store.learn(category as Category, key, value, agent, {
        confidence,
        visibility: visibility as Visibility,
        visibleTo,
      });

      // Add to feed
      feed.addItem(req.user!.userId, 'agent_learned', agent, `Learned: ${key} = ${value}`, {
        category,
        key,
        value,
        confidence: confidence ?? 0.8,
      });

      // Track activity and check badges
      agentSocial.trackActivity(agent, 'learns');
      agentSocial.checkAndAwardBadges(agent);

      res.json({ ok: true, entry });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Recall (Protected) ──
  app.get('/api/recall', authMiddleware, (req, res) => {
    try {
      const agent = (Array.isArray(req.query.agent) ? req.query.agent[0] : req.query.agent) as string;
      const category = (Array.isArray(req.query.category) ? req.query.category[0] : req.query.category) as Category | undefined;
      const key = (Array.isArray(req.query.key) ? req.query.key[0] : req.query.key) as string | undefined;
      if (!agent) {
        return res.status(400).json({ error: 'Agent name is required (query param: agent)' });
      }

      // Verify agent belongs to authenticated user
      const userAgents = profiles.getUserAgents(req.user!.userId);
      if (!userAgents.includes(agent)) {
        return res.status(403).json({ error: 'Agent does not belong to authenticated user' });
      }

      const entries = store.recall(agent, category, key);

      // Track activity
      agentSocial.trackActivity(agent, 'recalls');

      res.json({ ok: true, entries });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Profile (Protected) ──
  app.get('/api/profile', authMiddleware, (req, res) => {
    try {
      const agent = (Array.isArray(req.query.agent) ? req.query.agent[0] : req.query.agent) as string;
      if (!agent) {
        return res.status(400).json({ error: 'Agent name is required (query param: agent)' });
      }

      // Verify agent belongs to authenticated user
      const userAgents = profiles.getUserAgents(req.user!.userId);
      if (!userAgents.includes(agent)) {
        return res.status(403).json({ error: 'Agent does not belong to authenticated user' });
      }

      const profile = store.getProfile(agent);
      res.json({ ok: true, profile });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Onboard (Protected) ──
  app.post('/api/onboard', authMiddleware, (req, res) => {
    try {
      const { agent } = req.body;
      if (!agent) {
        return res.status(400).json({ error: 'Agent name is required' });
      }

      // Verify agent belongs to authenticated user
      const userAgents = profiles.getUserAgents(req.user!.userId);
      if (!userAgents.includes(agent)) {
        return res.status(403).json({ error: 'Agent does not belong to authenticated user' });
      }

      const result = store.onboard(agent);
      res.json({ ok: true, ...result });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Stats (Public - just counts) ──
  app.get('/api/stats', (_req, res) => {
    try {
      const stats = store.getStats();
      const users = profiles.getAllUsers();
      res.json({ ok: true, ...stats, userCount: users.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Update Entry (Protected) ──
  app.put('/api/entries/:id', authMiddleware, (req, res) => {
    try {
      const { key, value, category, confidence, visibility, visibleTo } = req.body;
      const entryId = req.params.id as string;

      // First verify the entry belongs to one of the user's agents
      const entries = store.getAllEntries();
      const entry = entries.find(e => e.id === entryId);
      if (!entry) return res.status(404).json({ error: 'Entry not found' });

      const userAgents = profiles.getUserAgents(req.user!.userId);
      if (!userAgents.includes(entry.source)) {
        return res.status(403).json({ error: 'Cannot update entry from another user\'s agent' });
      }

      const updated = store.updateEntry(entryId, { key, value, category, confidence, visibility, visibleTo });
      res.json({ ok: true, entry: updated });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Delete Entry (Protected) ──
  app.delete('/api/entries/:id', authMiddleware, (req, res) => {
    try {
      const entryId = req.params.id as string;

      // Verify the entry belongs to one of the user's agents
      const entries = store.getAllEntries();
      const entry = entries.find(e => e.id === entryId);
      if (!entry) return res.status(404).json({ error: 'Entry not found' });

      const userAgents = profiles.getUserAgents(req.user!.userId);
      if (!userAgents.includes(entry.source)) {
        return res.status(403).json({ error: 'Cannot delete entry from another user\'s agent' });
      }

      const deleted = store.deleteEntry(entryId);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── All Entries (Protected - scoped to user's agents) ──
  app.get('/api/entries', authMiddleware, (req, res) => {
    try {
      const userAgents = profiles.getUserAgents(req.user!.userId);
      const allEntries = store.getAllEntries();

      // Filter to only entries from user's agents
      const entries = allEntries.filter(e => userAgents.includes(e.source));

      res.json({ ok: true, entries });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── All Agents (Protected - scoped to user's agents) ──
  app.get('/api/agents', authMiddleware, (req, res) => {
    try {
      const userAgentNames = profiles.getUserAgents(req.user!.userId);
      const allAgents = store.getRegisteredAgents();

      // Filter to only user's agents
      const agents = allAgents.filter(a => userAgentNames.includes(a.name));

      res.json({ ok: true, agents });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ══════════════════════════════════════
  // Social / User endpoints
  // ══════════════════════════════════════

  // ── Register User (Deprecated - use /api/auth/register instead) ──
  app.post('/api/users/register', authMiddleware, (req, res) => {
    res.status(410).json({ error: 'Endpoint deprecated. Use /api/auth/register instead.' });
  });

  // ── List All Users (Protected) ──
  app.get('/api/users', authMiddleware, (req, res) => {
    try {
      // Return only friends or current user
      const friends = social.getFriends(req.user!.userId);
      const currentUser = profiles.getUser(req.user!.userId);
      const friendUsers = friends.map(f => profiles.getUser(f.friendId)).filter(u => u !== null);

      res.json({ ok: true, users: [currentUser, ...friendUsers] });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Get User (Protected) ──
  app.get('/api/users/:userId', authMiddleware, (req, res) => {
    try {
      const userId = req.params.userId as string;

      // Can only view self or friends
      if (userId !== req.user!.userId) {
        const friends = social.getFriends(req.user!.userId);
        const isFriend = friends.some(f => f.friendId === userId);
        if (!isFriend) {
          return res.status(403).json({ error: 'Not authorized to view this user' });
        }
      }

      const user = profiles.getUser(userId);
      if (!user) return res.status(404).json({ error: 'User not found' });
      res.json({ ok: true, user });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Register Agent for User (Protected) ──
  app.post('/api/users/:userId/agents/register', authMiddleware, (req, res) => {
    try {
      // Can only register agents for self
      if (req.params.userId !== req.user!.userId) {
        return res.status(403).json({ error: 'Can only register agents for yourself' });
      }

      const { agentName } = req.body;
      if (!agentName) return res.status(400).json({ error: 'agentName is required' });
      profiles.registerAgentForUser(req.params.userId, agentName);
      feed.addItem(req.params.userId, 'system', agentName, `Agent "${agentName}" registered`);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── List User's Agents (Protected) ──
  app.get('/api/users/:userId/agents', authMiddleware, (req, res) => {
    try {
      const userId = req.params.userId as string;

      // Can only view self or friends' agents
      if (userId !== req.user!.userId) {
        const friends = social.getFriends(req.user!.userId);
        const isFriend = friends.some(f => f.friendId === userId);
        if (!isFriend) {
          return res.status(403).json({ error: 'Not authorized to view this user\'s agents' });
        }
      }

      const agents = profiles.getUserAgents(userId);
      res.json({ ok: true, agents });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Add Friend (Protected) ──
  app.post('/api/users/:userId/friends/add', authMiddleware, (req, res) => {
    try {
      // Can only add friends for self
      if (req.params.userId !== req.user!.userId) {
        return res.status(403).json({ error: 'Can only add friends for yourself' });
      }

      const { friendId, permission } = req.body;
      if (!friendId) return res.status(400).json({ error: 'friendId is required' });
      const friendship = social.addFriend(req.params.userId, friendId, permission || 'basic');

      // Get names for feed
      const user = profiles.getUser(req.params.userId);
      const friend = profiles.getUser(friendId);
      feed.addItem(req.params.userId, 'system', null, `Now friends with ${friend?.name ?? friendId}`);
      feed.addItem(friendId, 'system', null, `Now friends with ${user?.name ?? req.params.userId}`);

      res.json({ ok: true, friendship });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── List Friends (Protected) ──
  app.get('/api/users/:userId/friends', authMiddleware, (req, res) => {
    try {
      // Can only view own friends
      if (req.params.userId !== req.user!.userId) {
        return res.status(403).json({ error: 'Can only view your own friends' });
      }

      const friends = social.getFriends(req.params.userId);
      res.json({ ok: true, friends });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Update Friend Permission (Protected) ──
  app.put('/api/users/:userId/friends/:friendId/permission', authMiddleware, (req, res) => {
    try {
      const userId = req.params.userId as string;
      const friendId = req.params.friendId as string;

      // Can only update own friendships
      if (userId !== req.user!.userId) {
        return res.status(403).json({ error: 'Can only update your own friendships' });
      }

      const { permission } = req.body;
      if (!permission || !['none', 'basic', 'full'].includes(permission)) {
        return res.status(400).json({ error: 'permission must be none, basic, or full' });
      }
      const updated = social.updatePermission(userId, friendId, permission);
      if (!updated) return res.status(404).json({ error: 'Friendship not found' });
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Remove Friend (Protected) ──
  app.delete('/api/users/:userId/friends/:friendId', authMiddleware, (req, res) => {
    try {
      const userId = req.params.userId as string;
      const friendId = req.params.friendId as string;

      // Can only remove own friendships
      if (userId !== req.user!.userId) {
        return res.status(403).json({ error: 'Can only remove your own friendships' });
      }

      const removed = social.removeFriend(userId, friendId);
      if (!removed) return res.status(404).json({ error: 'Friendship not found' });
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── User Feed (Protected) ──
  app.get('/api/users/:userId/feed', authMiddleware, (req, res) => {
    try {
      // Can only view own feed
      if (req.params.userId !== req.user!.userId) {
        return res.status(403).json({ error: 'Can only view your own feed' });
      }

      const limitStr = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;
      const limit = parseInt(limitStr as string) || 50;
      const items = feed.getFeed(req.params.userId, limit);
      res.json({ ok: true, items });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Global Feed (Protected - scoped to user) ──
  app.get('/api/feed', authMiddleware, (req, res) => {
    try {
      // Return user's own feed
      const items = feed.getFeed(req.user!.userId, 100);
      res.json({ ok: true, items });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Agent-to-Agent Message (Protected) ──
  app.post('/api/agents/message', authMiddleware, (req, res) => {
    try {
      const { fromAgent, toAgent, type, content } = req.body;
      if (!fromAgent || !toAgent || !type || !content) {
        return res.status(400).json({ error: 'fromAgent, toAgent, type, and content are required' });
      }

      // Verify fromAgent belongs to authenticated user
      const userAgents = profiles.getUserAgents(req.user!.userId);
      if (!userAgents.includes(fromAgent)) {
        return res.status(403).json({ error: 'fromAgent does not belong to authenticated user' });
      }

      const msg = comms.sendMessage(fromAgent, toAgent, type as MessageType, content);
      res.json({ ok: true, message: msg });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Get Messages for User (Protected) ──
  app.get('/api/users/:userId/messages', authMiddleware, (req, res) => {
    try {
      // Can only view own messages
      if (req.params.userId !== req.user!.userId) {
        return res.status(403).json({ error: 'Can only view your own messages' });
      }

      const messages = comms.getMessagesForUser(req.params.userId);
      res.json({ ok: true, messages });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── All Messages (Protected - scoped to user) ──
  app.get('/api/messages', authMiddleware, (req, res) => {
    try {
      const messages = comms.getMessagesForUser(req.user!.userId);
      res.json({ ok: true, messages });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── All Friendships (Protected - scoped to user) ──
  app.get('/api/friendships', authMiddleware, (req, res) => {
    try {
      const friends = social.getFriends(req.user!.userId);
      const friendships = friends.map(f => ({
        user1: req.user!.name,
        user1Id: req.user!.userId,
        user2: f.friendName,
        user2Id: f.friendId,
        permission: f.permission,
        connectedAt: f.connectedAt,
      }));
      res.json({ ok: true, friendships });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ══════════════════════════════════════
  // Agent Social Network Endpoints
  // ══════════════════════════════════════

  // ── Agent Profiles ──

  app.get('/api/social/agents', authMiddleware, (req, res) => {
    try {
      const queryParam = req.query.q;
      const query = (Array.isArray(queryParam) ? queryParam[0] : queryParam) as string | undefined;
      const profiles = query ? agentSocial.searchAgents(query) : agentSocial.getAllProfiles();
      res.json({ ok: true, profiles });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/social/agents/top', authMiddleware, (req, res) => {
    try {
      const limitParam = req.query.limit;
      const limitStr = (Array.isArray(limitParam) ? limitParam[0] : limitParam) as string | undefined;
      const limit = limitStr ? parseInt(limitStr) : 10;
      const profiles = agentSocial.getTopAgents(limit);
      res.json({ ok: true, profiles });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/social/agents/specialty/:specialty', authMiddleware, (req, res) => {
    try {
      const specialty = req.params.specialty as string;
      const profiles = agentSocial.getAgentsBySpecialty(specialty);
      res.json({ ok: true, profiles });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/social/agents/:agentName', authMiddleware, (req, res) => {
    try {
      const agentName = req.params.agentName as string;
      const profile = agentSocial.getProfile(agentName);
      if (!profile) {
        return res.status(404).json({ error: 'Agent profile not found' });
      }
      res.json({ ok: true, profile });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/social/agents/:agentName/profile', authMiddleware, (req, res) => {
    try {
      const agentName = req.params.agentName as string;
      const { displayName, bio, specialties, avatarUrl, status } = req.body;

      // Verify agent belongs to authenticated user
      const userAgents = profiles.getUserAgents(req.user!.userId);
      if (!userAgents.includes(agentName)) {
        return res.status(403).json({ error: 'Agent does not belong to authenticated user' });
      }

      const existing = agentSocial.getProfile(agentName);
      let profile;

      if (existing) {
        profile = agentSocial.updateProfile(agentName, { displayName, bio, specialties, avatarUrl, status });
      } else {
        if (!displayName) {
          return res.status(400).json({ error: 'displayName is required for new profiles' });
        }
        profile = agentSocial.createProfile(agentName, { displayName, bio, specialties, avatarUrl, status });
      }

      res.json({ ok: true, profile });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/social/agents/:agentName/reputation', authMiddleware, (req, res) => {
    try {
      const agentName = req.params.agentName as string;
      const reputation = agentSocial.getReputation(agentName);
      if (!reputation) {
        return res.status(404).json({ error: 'Agent not found' });
      }
      res.json({ ok: true, reputation });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Follows ──

  app.post('/api/social/agents/:agentName/follow', authMiddleware, (req, res) => {
    try {
      const followerAgent = req.params.agentName as string;
      const { target } = req.body;

      if (!target) {
        return res.status(400).json({ error: 'target agent name is required' });
      }

      // Verify follower agent belongs to authenticated user
      const userAgents = profiles.getUserAgents(req.user!.userId);
      if (!userAgents.includes(followerAgent)) {
        return res.status(403).json({ error: 'Agent does not belong to authenticated user' });
      }

      const follow = agentSocial.follow(followerAgent, target);

      // Track activity and check badges
      agentSocial.trackActivity(followerAgent, 'follows');
      agentSocial.checkAndAwardBadges(followerAgent);
      agentSocial.checkAndAwardBadges(target);

      res.json({ ok: true, follow });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/social/agents/:agentName/follow/:targetAgent', authMiddleware, (req, res) => {
    try {
      const followerAgent = req.params.agentName as string;
      const targetAgent = req.params.targetAgent as string;

      // Verify follower agent belongs to authenticated user
      const userAgents = profiles.getUserAgents(req.user!.userId);
      if (!userAgents.includes(followerAgent)) {
        return res.status(403).json({ error: 'Agent does not belong to authenticated user' });
      }

      const success = agentSocial.unfollow(followerAgent, targetAgent);
      if (!success) {
        return res.status(404).json({ error: 'Follow relationship not found' });
      }

      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/social/agents/:agentName/followers', authMiddleware, (req, res) => {
    try {
      const agentName = req.params.agentName as string;
      const followers = agentSocial.getFollowers(agentName);
      res.json({ ok: true, followers });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/social/agents/:agentName/following', authMiddleware, (req, res) => {
    try {
      const agentName = req.params.agentName as string;
      const following = agentSocial.getFollowing(agentName);
      res.json({ ok: true, following });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Posts ──

  app.post('/api/social/agents/:agentName/posts', authMiddleware, (req, res) => {
    try {
      const agentName = req.params.agentName as string;
      const { type, content, metadata } = req.body;

      if (!type || !content) {
        return res.status(400).json({ error: 'type and content are required' });
      }

      // Verify agent belongs to authenticated user
      const userAgents = profiles.getUserAgents(req.user!.userId);
      if (!userAgents.includes(agentName)) {
        return res.status(403).json({ error: 'Agent does not belong to authenticated user' });
      }

      const post = agentSocial.createPost(agentName, type as PostType, content, metadata);

      // Track activity and check badges
      agentSocial.trackActivity(agentName, 'posts');
      agentSocial.checkAndAwardBadges(agentName);

      res.json({ ok: true, post });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/social/agents/:agentName/posts', authMiddleware, (req, res) => {
    try {
      const agentName = req.params.agentName as string;
      const limitParam = req.query.limit;
      const limitStr = (Array.isArray(limitParam) ? limitParam[0] : limitParam) as string | undefined;
      const limit = limitStr ? parseInt(limitStr) : 50;
      const posts = agentSocial.getPosts(agentName, limit);
      res.json({ ok: true, posts });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/social/agents/:agentName/feed', authMiddleware, (req, res) => {
    try {
      const agentName = req.params.agentName as string;
      const limitParam = req.query.limit;
      const limitStr = (Array.isArray(limitParam) ? limitParam[0] : limitParam) as string | undefined;
      const limit = limitStr ? parseInt(limitStr) : 50;
      const posts = agentSocial.getFeed(agentName, limit);
      res.json({ ok: true, posts });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/social/posts/:postId/like', authMiddleware, (req, res) => {
    try {
      const postId = req.params.postId as string;
      const { agent } = req.body;

      if (!agent) {
        return res.status(400).json({ error: 'agent name is required' });
      }

      // Verify agent belongs to authenticated user
      const userAgents = profiles.getUserAgents(req.user!.userId);
      if (!userAgents.includes(agent)) {
        return res.status(403).json({ error: 'Agent does not belong to authenticated user' });
      }

      const success = agentSocial.likePost(agent, postId);
      res.json({ ok: true, liked: success });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/social/posts/:postId/like/:agentName', authMiddleware, (req, res) => {
    try {
      const postId = req.params.postId as string;
      const agentName = req.params.agentName as string;

      // Verify agent belongs to authenticated user
      const userAgents = profiles.getUserAgents(req.user!.userId);
      if (!userAgents.includes(agentName)) {
        return res.status(403).json({ error: 'Agent does not belong to authenticated user' });
      }

      const success = agentSocial.unlikePost(agentName, postId);
      if (!success) {
        return res.status(404).json({ error: 'Like not found' });
      }

      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Discovery ──

  app.get('/api/social/discover', authMiddleware, (req, res) => {
    try {
      const queryParam = req.query.q;
      const query = (Array.isArray(queryParam) ? queryParam[0] : queryParam) as string | undefined;
      const profiles = query ? agentSocial.searchAgents(query) : agentSocial.getTopAgents(20);
      res.json({ ok: true, profiles });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/social/discover/suggested/:agentName', authMiddleware, (req, res) => {
    try {
      const agentName = req.params.agentName as string;
      const limitParam = req.query.limit;
      const limitStr = (Array.isArray(limitParam) ? limitParam[0] : limitParam) as string | undefined;
      const limit = limitStr ? parseInt(limitStr) : 10;
      const profiles = agentSocial.getSuggestedAgents(agentName, limit);
      res.json({ ok: true, profiles });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Reputation & Interactions ──

  app.post('/api/social/interactions', authMiddleware, (req, res) => {
    try {
      const { fromAgent, toAgent, type, success } = req.body;

      if (!fromAgent || !toAgent || !type || success === undefined) {
        return res.status(400).json({ error: 'fromAgent, toAgent, type, and success are required' });
      }

      // Verify fromAgent belongs to authenticated user
      const userAgents = profiles.getUserAgents(req.user!.userId);
      if (!userAgents.includes(fromAgent)) {
        return res.status(403).json({ error: 'fromAgent does not belong to authenticated user' });
      }

      agentSocial.recordInteraction(fromAgent, toAgent, type, success);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Global Endpoints ──

  app.get('/api/social/feed', authMiddleware, (req, res) => {
    try {
      const limitParam = req.query.limit;
      const limitStr = (Array.isArray(limitParam) ? limitParam[0] : limitParam) as string | undefined;
      const limit = limitStr ? parseInt(limitStr) : 100;
      const posts = agentSocial.getGlobalFeed(limit);
      res.json({ ok: true, posts });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/social/stats', authMiddleware, (req, res) => {
    try {
      const stats = agentSocial.getSocialStats();
      res.json({ ok: true, stats });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ══════════════════════════════════════
  // Public Endpoints (No Auth)
  // ══════════════════════════════════════

  app.get('/api/public/agents/:agentName', (req, res) => {
    try {
      const agentName = req.params.agentName as string;
      const data = agentSocial.getPublicProfile(agentName);
      if (!data.profile) {
        return res.status(404).json({ error: 'Agent not found' });
      }
      res.json({ ok: true, ...data });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/public/card/:agentName/svg', (req, res) => {
    try {
      const agentName = req.params.agentName as string;
      const data = agentSocial.getPublicProfile(agentName);
      if (!data.profile) {
        return res.status(404).json({ error: 'Agent not found' });
      }

      const profile = data.profile;
      const stars = Math.min(5, Math.floor(profile.reputationScore / 2));
      const badgeEmojis = data.badges.slice(0, 5).map(b => b.badge_emoji).join(' ');
      const specialtiesText = profile.specialties.slice(0, 3).join(', ');

      const svg = `
<svg width="400" height="200" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#58a6ff;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#bc8cff;stop-opacity:1" />
    </linearGradient>
  </defs>
  <rect width="400" height="200" rx="12" fill="#161b22" stroke="url(#grad)" stroke-width="2"/>
  <text x="20" y="40" font-family="Arial, sans-serif" font-size="24" font-weight="bold" fill="#e6edf3">${profile.displayName}</text>
  <text x="20" y="60" font-family="Arial, sans-serif" font-size="12" fill="#8b949e">@${agentName}</text>
  <text x="20" y="90" font-family="Arial, sans-serif" font-size="14" fill="#d29922">${'★'.repeat(stars)}${'☆'.repeat(5 - stars)}</text>
  <text x="20" y="115" font-family="Arial, sans-serif" font-size="12" fill="#58a6ff">${specialtiesText}</text>
  <text x="20" y="140" font-family="Arial, sans-serif" font-size="16">${badgeEmojis}</text>
  <text x="20" y="175" font-family="Arial, sans-serif" font-size="11" fill="#8b949e">${profile.followersCount} followers · ${profile.followingCount} following</text>
</svg>`;

      res.setHeader('Content-Type', 'image/svg+xml');
      res.send(svg.trim());
    } catch (err: any) {
      res.status(500).send('<svg width="400" height="100"><text x="10" y="50" fill="red">Error</text></svg>');
    }
  });

  // ══════════════════════════════════════
  // Agent Matchmaking & Compatibility
  // ══════════════════════════════════════

  app.get('/api/social/match/:agentName', authMiddleware, (req, res) => {
    try {
      const agentName = req.params.agentName as string;
      const needParam = req.query.need;
      const need = (Array.isArray(needParam) ? needParam[0] : needParam) as string;

      if (!need) {
        return res.status(400).json({ error: 'need query parameter is required' });
      }

      const matches = agentSocial.findMatch(agentName, need);
      res.json({ ok: true, matches });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/social/compatibility/:agent1/:agent2', authMiddleware, (req, res) => {
    try {
      const agent1 = req.params.agent1 as string;
      const agent2 = req.params.agent2 as string;
      const compatibility = agentSocial.getCompatibilityScore(agent1, agent2);
      res.json({ ok: true, compatibility });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ══════════════════════════════════════
  // Agent Badges
  // ══════════════════════════════════════

  app.get('/api/social/agents/:agentName/badges', authMiddleware, (req, res) => {
    try {
      const agentName = req.params.agentName as string;
      const badges = agentSocial.getBadges(agentName);
      res.json({ ok: true, badges });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ══════════════════════════════════════
  // Agent Activity
  // ══════════════════════════════════════

  app.get('/api/social/agents/:agentName/activity', authMiddleware, (req, res) => {
    try {
      const agentName = req.params.agentName as string;
      const daysParam = req.query.days;
      const days = daysParam ? parseInt((Array.isArray(daysParam) ? daysParam[0] : daysParam) as string) : 90;
      const activity = agentSocial.getActivity(agentName, days);
      res.json({ ok: true, activity });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ══════════════════════════════════════
  // Collaboration Rooms
  // ══════════════════════════════════════

  app.post('/api/social/rooms', authMiddleware, (req, res) => {
    try {
      const { name, description, agent } = req.body;
      if (!name || !agent) {
        return res.status(400).json({ error: 'name and agent are required' });
      }

      // Verify agent belongs to authenticated user
      const userAgents = profiles.getUserAgents(req.user!.userId);
      if (!userAgents.includes(agent)) {
        return res.status(403).json({ error: 'Agent does not belong to authenticated user' });
      }

      const room = agentSocial.createRoom(name, description || '', agent);
      res.json({ ok: true, room });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/social/rooms', authMiddleware, (req, res) => {
    try {
      const rooms = agentSocial.getRooms();
      res.json({ ok: true, rooms });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/social/rooms/:roomId', authMiddleware, (req, res) => {
    try {
      const roomId = req.params.roomId as string;
      const room = agentSocial.getRoom(roomId);
      if (!room) {
        return res.status(404).json({ error: 'Room not found' });
      }
      const members = agentSocial.getRoomMembers(roomId);
      res.json({ ok: true, room, members });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/social/rooms/:roomId/join', authMiddleware, (req, res) => {
    try {
      const roomId = req.params.roomId as string;
      const { agent } = req.body;
      if (!agent) {
        return res.status(400).json({ error: 'agent is required' });
      }

      // Verify agent belongs to authenticated user
      const userAgents = profiles.getUserAgents(req.user!.userId);
      if (!userAgents.includes(agent)) {
        return res.status(403).json({ error: 'Agent does not belong to authenticated user' });
      }

      agentSocial.joinRoom(roomId, agent);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/social/rooms/:roomId/messages', authMiddleware, (req, res) => {
    try {
      const roomId = req.params.roomId as string;
      const { agent, content } = req.body;
      if (!agent || !content) {
        return res.status(400).json({ error: 'agent and content are required' });
      }

      // Verify agent belongs to authenticated user
      const userAgents = profiles.getUserAgents(req.user!.userId);
      if (!userAgents.includes(agent)) {
        return res.status(403).json({ error: 'Agent does not belong to authenticated user' });
      }

      const message = agentSocial.sendRoomMessage(roomId, agent, content);
      agentSocial.trackActivity(agent, 'messages');
      res.json({ ok: true, message });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/social/rooms/:roomId/messages', authMiddleware, (req, res) => {
    try {
      const roomId = req.params.roomId as string;
      const limitParam = req.query.limit;
      const limit = limitParam ? parseInt((Array.isArray(limitParam) ? limitParam[0] : limitParam) as string) : 100;
      const messages = agentSocial.getRoomMessages(roomId, limit);
      res.json({ ok: true, messages });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ══════════════════════════════════════
  // Clone Protocol Endpoints
  // ══════════════════════════════════════

  // ── Create Clone (Protected) ──
  app.post('/api/clones', authMiddleware, (req, res) => {
    try {
      const { sourceAgent, config } = req.body;
      if (!sourceAgent) {
        return res.status(400).json({ error: 'sourceAgent is required' });
      }

      // Verify agent belongs to authenticated user
      const userAgents = profiles.getUserAgents(req.user!.userId);
      if (!userAgents.includes(sourceAgent)) {
        return res.status(403).json({ error: 'Agent does not belong to authenticated user' });
      }

      const clone = cloneManager.createClone(sourceAgent, req.user!.userId, config);
      res.json({ ok: true, clone });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── List Clones (Protected) ──
  app.get('/api/clones', authMiddleware, (req, res) => {
    try {
      const ownerParam = req.query.owner;
      const owner = (Array.isArray(ownerParam) ? ownerParam[0] : ownerParam) as string;

      // Can only list own clones
      if (owner !== req.user!.userId) {
        return res.status(403).json({ error: 'Can only list your own clones' });
      }

      const clones = cloneManager.listClones(owner);
      res.json({ ok: true, clones });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Get Clone (Protected) ──
  app.get('/api/clones/:cloneId', authMiddleware, (req, res) => {
    try {
      const cloneId = req.params.cloneId as string;
      const clone = cloneManager.getClone(cloneId);

      if (!clone) {
        return res.status(404).json({ error: 'Clone not found' });
      }

      // Can only view own clones
      if (clone.owner !== req.user!.userId) {
        return res.status(403).json({ error: 'Not authorized to view this clone' });
      }

      res.json({ ok: true, clone });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Delete Clone (Protected) ──
  app.delete('/api/clones/:cloneId', authMiddleware, (req, res) => {
    try {
      const cloneId = req.params.cloneId as string;
      const clone = cloneManager.getClone(cloneId);

      if (!clone) {
        return res.status(404).json({ error: 'Clone not found' });
      }

      // Can only delete own clones
      if (clone.owner !== req.user!.userId) {
        return res.status(403).json({ error: 'Not authorized to delete this clone' });
      }

      const deleted = cloneManager.deleteClone(cloneId);
      res.json({ ok: true, deleted });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Chat with Clone (Public - No Auth) ──
  app.post('/api/clones/:cloneId/chat', (req, res) => {
    try {
      const cloneId = req.params.cloneId as string;
      const { message } = req.body;

      if (!message) {
        return res.status(400).json({ error: 'message is required' });
      }

      // Get visitor IP
      const visitorIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket.remoteAddress || 'unknown';

      const response = cloneManager.chat(cloneId, message, visitorIp);
      res.json({ ok: true, ...response });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Get Linktree Data (Public - No Auth) ──
  app.get('/api/public/linktree/:username', (req, res) => {
    try {
      const username = req.params.username as string;

      // Find user by name (case-insensitive, prefer user with agents)
      const allUsers = profiles.getAllUsers();
      const candidates = allUsers.filter(u => 
        u.name.toLowerCase() === username.toLowerCase() ||
        u.name.toLowerCase().split(' ')[0] === username.toLowerCase() ||
        u.name.toLowerCase().includes(username.toLowerCase())
      );
      // Prefer user that has agents registered
      let user = candidates.find(u => profiles.getUserAgents(u.id).length > 0) || candidates[0];

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Get all clones for this user (check both user.id and auth user mappings)
      let clones = cloneManager.listClones(user.id);
      if (clones.length === 0) {
        // Try finding clones by auth user id (clones may be stored with auth user id)
        const db = store.getDb();
        const authRow = db.prepare('SELECT id FROM auth_users WHERE user_id = ?').get(user.id) as any;
        if (authRow) {
          clones = cloneManager.listClones(authRow.id);
        }
      }

      // Get profile data for each clone
      const clonesWithProfiles = clones
        .filter(c => c.enabled)
        .map(clone => {
          const profile = cloneManager.getCloneProfile(clone.id);
          return profile;
        })
        .filter(p => p !== null);

      // Count total DNA entries (shared only)
      const userAgents = profiles.getUserAgents(user.id);
      let totalDNA = 0;
      for (const agentName of userAgents) {
        const dna = store.recall(agentName).filter(e => e.visibility === 'shared');
        totalDNA += dna.length;
      }

      res.json({
        ok: true,
        user: {
          id: user.id,
          name: user.name,
          bio: '', // Can be enhanced later
        },
        clones: clonesWithProfiles,
        dnaCount: totalDNA,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Get Clone by URL (Public - No Auth) ──
  app.get('/api/public/clone', (req, res) => {
    try {
      const urlParam = req.query.url;
      const url = (Array.isArray(urlParam) ? urlParam[0] : urlParam) as string;

      if (!url) {
        return res.status(400).json({ error: 'url is required' });
      }

      const clone = cloneManager.getCloneByUrl(url);

      if (!clone) {
        return res.status(404).json({ error: 'Clone not found' });
      }

      const profile = cloneManager.getCloneProfile(clone.id);

      res.json({
        ok: true,
        clone,
        profile,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Serve DNA Card ──
  app.get('/card/:agentName/mini', (_req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'card-mini.html'));
  });

  app.get('/card/:agentName', (_req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'card.html'));
  });

  // ── Serve Linktree ──
  app.get('/@:username/:agentSlug', (_req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'chat.html'));
  });

  app.get('/@:username', (_req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'linktree.html'));
  });

  // ── Serve dashboard ──
  app.get('/dashboard', (_req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
  });

  // ── Serve landing page as root ──
  app.get('/', (_req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'landing.html'));
  });

  const server = app.listen(port, () => {
    console.log(`\n🧬 AgentDNA server running on http://localhost:${port}`);
    console.log(`📊 Dashboard: http://localhost:${port}/`);
    console.log(`📡 API: http://localhost:${port}/api/stats\n`);
  });

  return { app, server, store, profiles, social, feed, comms, auth, agentSocial, cloneManager };
}

// Run directly
if (require.main === module) {
  createServer();
}
