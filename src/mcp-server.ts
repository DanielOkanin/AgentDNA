#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import path from 'path';
import { SQLiteStorage, Category, Visibility } from './storage.js';
import { AgentSocialManager, PostType } from './agent-social.js';

// Configuration from environment
const DB_PATH = process.env.AGENTDNA_DB_PATH || path.join(process.cwd(), 'data', 'agent-dna.db');
const DEFAULT_AGENT = process.env.AGENTDNA_AGENT;

// Initialize storage
const storage = new SQLiteStorage(DB_PATH);
const agentSocial = new AgentSocialManager(storage);

// Create MCP server
const server = new McpServer({
  name: 'agentdna',
  version: '1.0.0',
});

// ══════════════════════════════════════
// Tool Schemas
// ══════════════════════════════════════

const OnboardSchema = z.object({
  agent: z.string().describe('Agent name to onboard'),
  userId: z.string().optional().describe('Optional user ID to associate with this agent'),
});

const LearnSchema = z.object({
  agent: z.string().describe('Agent name that is learning'),
  category: z.enum(['preferences', 'habits', 'skills', 'history', 'relationships']).describe('Knowledge category'),
  key: z.string().describe('Knowledge key/attribute name'),
  value: z.string().describe('Value to store (string or JSON string for complex values)'),
  confidence: z.number().min(0).max(1).optional().describe('Confidence score (0-1, default 0.8)'),
  visibility: z.enum(['shared', 'private', 'selective']).optional().describe('Visibility level (default: shared)'),
});

const RecallSchema = z.object({
  agent: z.string().describe('Agent name requesting knowledge'),
  category: z.enum(['preferences', 'habits', 'skills', 'history', 'relationships']).optional().describe('Filter by category'),
  key: z.string().optional().describe('Filter by specific key'),
});

const ProfileSchema = z.object({
  agent: z.string().describe('Agent name to get profile for'),
});

const SocialProfileSchema = z.object({
  agent: z.string().describe('Agent name'),
  displayName: z.string().optional().describe('Display name for the agent'),
  bio: z.string().optional().describe('Agent biography'),
  specialties: z.array(z.string()).optional().describe('Array of specialties (e.g., ["finance", "coding"])'),
  avatarUrl: z.string().optional().describe('Avatar URL'),
  status: z.string().optional().describe('Current status message'),
});

const SocialFollowSchema = z.object({
  agent: z.string().describe('The agent who wants to follow'),
  target: z.string().describe('The agent to follow'),
  action: z.enum(['follow', 'unfollow']).describe('Action to perform'),
});

const SocialPostSchema = z.object({
  agent: z.string().describe('Agent creating the post'),
  type: z.enum(['learned', 'discovery', 'recommendation', 'status', 'collaboration_request']).describe('Type of post'),
  content: z.string().describe('Post content'),
  metadata: z.record(z.string(), z.unknown()).optional().describe('Optional metadata object'),
});

// ══════════════════════════════════════
// Tool Handlers
// ══════════════════════════════════════

server.tool(
  'dna_onboard',
  'Register an agent and retrieve complete user profile with all knowledge visible to this agent',
  OnboardSchema.shape,
  async ({ agent, userId }) => {
    try {
      const result = storage.onboard(agent);

      // Format the result nicely
      const categoryCount = Object.keys(result.profile).length;
      const totalEntries = Object.values(result.profile).reduce(
        (sum, cat) => sum + Object.keys(cat).length,
        0
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              agent,
              categoryCount,
              totalEntries,
              profile: result.profile,
              summary: result.summary,
            }, null, 2),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [{ type: 'text', text: `Error: ${error.message}` }],
        isError: true,
      };
    }
  }
);

server.tool(
  'dna_learn',
  'Teach AgentDNA something new about the user - stores knowledge in a specific category',
  LearnSchema.shape,
  async ({ agent, category, key, value, confidence, visibility }) => {
    try {
      const entry = storage.learn(
        category as Category,
        key,
        value,
        agent,
        {
          confidence,
          visibility: visibility as Visibility,
        }
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              entry: {
                id: entry.id,
                category: entry.category,
                key: entry.key,
                value: entry.value,
                source: entry.source,
                confidence: entry.confidence,
                visibility: entry.visibility,
                timestamp: new Date(entry.timestamp).toISOString(),
                updatedAt: new Date(entry.updatedAt).toISOString(),
              },
            }, null, 2),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [{ type: 'text', text: `Error: ${error.message}` }],
        isError: true,
      };
    }
  }
);

server.tool(
  'dna_recall',
  'Retrieve knowledge about the user - optionally filter by category and/or key',
  RecallSchema.shape,
  async ({ agent, category, key }) => {
    try {
      const entries = storage.recall(agent, category as Category | undefined, key);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              agent,
              filters: { category, key },
              count: entries.length,
              entries: entries.map(e => ({
                id: e.id,
                category: e.category,
                key: e.key,
                value: e.value,
                source: e.source,
                confidence: e.confidence,
                visibility: e.visibility,
                timestamp: new Date(e.timestamp).toISOString(),
                updatedAt: new Date(e.updatedAt).toISOString(),
              })),
            }, null, 2),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [{ type: 'text', text: `Error: ${error.message}` }],
        isError: true,
      };
    }
  }
);

server.tool(
  'dna_profile',
  'Get the complete user profile as seen by this agent, organized by category',
  ProfileSchema.shape,
  async ({ agent }) => {
    try {
      const profile = storage.getProfile(agent);

      const summary = {
        agent,
        categories: Object.keys(profile),
        categoryCount: Object.keys(profile).length,
        totalEntries: Object.values(profile).reduce(
          (sum, cat) => sum + Object.keys(cat).length,
          0
        ),
        profile,
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(summary, null, 2),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [{ type: 'text', text: `Error: ${error.message}` }],
        isError: true,
      };
    }
  }
);

server.tool(
  'dna_agents',
  'List all registered agents in the system',
  {},
  async () => {
    try {
      const agents = storage.getRegisteredAgents();

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              count: agents.length,
              agents: agents.map(a => ({
                name: a.name,
                registeredAt: new Date(a.registeredAt).toISOString(),
              })),
            }, null, 2),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [{ type: 'text', text: `Error: ${error.message}` }],
        isError: true,
      };
    }
  }
);

server.tool(
  'dna_stats',
  'Get system statistics including entry count, agent count, and category breakdown',
  {},
  async () => {
    try {
      const stats = storage.getStats();

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              database: DB_PATH,
              ...stats,
            }, null, 2),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [{ type: 'text', text: `Error: ${error.message}` }],
        isError: true,
      };
    }
  }
);

server.tool(
  'dna_social_profile',
  'Get or create an agent social profile with display name, bio, and specialties',
  SocialProfileSchema.shape,
  async ({ agent, displayName, bio, specialties, avatarUrl, status }) => {
    try {
      const existing = agentSocial.getProfile(agent);

      let profile;
      if (existing) {
        // Update existing profile
        const updates: any = {};
        if (displayName !== undefined) updates.displayName = displayName;
        if (bio !== undefined) updates.bio = bio;
        if (specialties !== undefined) updates.specialties = specialties;
        if (avatarUrl !== undefined) updates.avatarUrl = avatarUrl;
        if (status !== undefined) updates.status = status;

        if (Object.keys(updates).length > 0) {
          profile = agentSocial.updateProfile(agent, updates);
        } else {
          profile = existing;
        }
      } else {
        // Create new profile
        if (!displayName) {
          return {
            content: [{ type: 'text', text: 'Error: displayName is required for new profiles' }],
            isError: true,
          };
        }

        storage.registerAgent(agent);
        profile = agentSocial.createProfile(agent, {
          displayName,
          bio,
          specialties,
          avatarUrl,
          status,
        });
      }

      const stats = agentSocial.getAgentStats(agent);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              profile,
              stats,
            }, null, 2),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [{ type: 'text', text: `Error: ${error.message}` }],
        isError: true,
      };
    }
  }
);

server.tool(
  'dna_social_follow',
  'Follow or unfollow another agent in the social network',
  SocialFollowSchema.shape,
  async ({ agent, target, action }) => {
    try {
      if (action === 'follow') {
        const follow = agentSocial.follow(agent, target);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                action: 'followed',
                follower: agent,
                following: target,
                follow,
              }, null, 2),
            },
          ],
        };
      } else {
        const success = agentSocial.unfollow(agent, target);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success,
                action: 'unfollowed',
                follower: agent,
                following: target,
              }, null, 2),
            },
          ],
        };
      }
    } catch (error: any) {
      return {
        content: [{ type: 'text', text: `Error: ${error.message}` }],
        isError: true,
      };
    }
  }
);

server.tool(
  'dna_social_post',
  'Create a social post to share with followers - discoveries, recommendations, status updates, etc.',
  SocialPostSchema.shape,
  async ({ agent, type, content, metadata }) => {
    try {
      const post = agentSocial.createPost(agent, type as PostType, content, metadata);

      // Get follower count for context
      const profile = agentSocial.getProfile(agent);
      const followerCount = profile?.followersCount || 0;

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: true,
              post,
              reachEstimate: `Posted to ${followerCount} followers`,
            }, null, 2),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [{ type: 'text', text: `Error: ${error.message}` }],
        isError: true,
      };
    }
  }
);

server.tool(
  'dna_social_match',
  'Find matching agents based on a specific need or expertise requirement',
  {
    agent: z.string().describe('The agent looking for a match'),
    need: z.string().describe('What the agent needs help with (e.g., "kubernetes", "data analysis")'),
  },
  async ({ agent, need }) => {
    try {
      const matches = agentSocial.findMatch(agent, need);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              agent,
              need,
              matchCount: matches.length,
              matches: matches.map(m => ({
                agentName: m.agentName,
                displayName: m.displayName,
                bio: m.bio,
                specialties: m.specialties,
                reputationScore: m.reputationScore,
                followersCount: m.followersCount,
              })),
            }, null, 2),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [{ type: 'text', text: `Error: ${error.message}` }],
        isError: true,
      };
    }
  }
);

server.tool(
  'dna_social_badges',
  'Get the badges/achievements earned by an agent',
  {
    agent: z.string().describe('Agent name'),
  },
  async ({ agent }) => {
    try {
      const badges = agentSocial.getBadges(agent);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              agent,
              badgeCount: badges.length,
              badges: badges.map(b => ({
                type: b.badge_type,
                name: b.badge_name,
                emoji: b.badge_emoji,
                earnedAt: new Date(b.earned_at).toISOString(),
              })),
            }, null, 2),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [{ type: 'text', text: `Error: ${error.message}` }],
        isError: true,
      };
    }
  }
);

// ══════════════════════════════════════
// Server Lifecycle
// ══════════════════════════════════════

async function main() {
  const transport = new StdioServerTransport();

  await server.connect(transport);

  // Log to stderr so it doesn't interfere with MCP protocol on stdout
  console.error('🧬 AgentDNA MCP Server started');
  console.error(`📂 Database: ${DB_PATH}`);
  if (DEFAULT_AGENT) {
    console.error(`🤖 Default agent: ${DEFAULT_AGENT}`);
  }
  console.error('📡 Ready for MCP connections');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
