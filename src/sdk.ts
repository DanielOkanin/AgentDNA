import type { DNAEntry, Category, Visibility } from './storage.js';

export interface LearnOptions {
  confidence?: number;
  visibility?: Visibility;
  visibleTo?: string[];
}

export interface SelfRegisterOptions {
  /** User to associate this agent with (userId) */
  userId?: string;
  /** If no userId, provide name+email to auto-create a user */
  userName?: string;
  userEmail?: string;
  /** Initial DNA entries the agent already knows */
  initialDNA?: Array<{
    category: Category;
    key: string;
    value: any;
    confidence?: number;
    visibility?: Visibility;
  }>;
}

export class AgentDNAClient {
  private baseUrl: string;
  public agentName: string;

  constructor(agentName: string, baseUrl = 'http://localhost:3456') {
    this.agentName = agentName;
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  async register(): Promise<{ ok: boolean; agent: { name: string; registeredAt: number } }> {
    const res = await fetch(`${this.baseUrl}/api/agents/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: this.agentName }),
    });
    return res.json() as any;
  }

  /**
   * Self-register: agent registers itself, optionally creates/links a user,
   * and seeds initial DNA entries. One call to get fully set up.
   */
  async selfRegister(options: SelfRegisterOptions = {}): Promise<{
    ok: boolean;
    agent: { name: string; registeredAt: number };
    user?: { id: string; name: string; email: string };
    profile: Record<string, Record<string, any>>;
    summary: string;
    entriesAdded: number;
  }> {
    const res = await fetch(`${this.baseUrl}/api/agents/self-register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent: this.agentName,
        ...options,
      }),
    });
    return res.json() as any;
  }

  async learn(
    category: Category,
    key: string,
    value: any,
    options: LearnOptions = {}
  ): Promise<{ ok: boolean; entry: DNAEntry }> {
    const res = await fetch(`${this.baseUrl}/api/learn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent: this.agentName,
        category,
        key,
        value,
        ...options,
      }),
    });
    return res.json() as any;
  }

  async recall(
    category?: Category,
    key?: string
  ): Promise<{ ok: boolean; entries: DNAEntry[] }> {
    const params = new URLSearchParams({ agent: this.agentName });
    if (category) params.set('category', category);
    if (key) params.set('key', key);

    const res = await fetch(`${this.baseUrl}/api/recall?${params}`);
    return res.json() as any;
  }

  async getProfile(): Promise<{ ok: boolean; profile: Record<string, Record<string, any>> }> {
    const res = await fetch(`${this.baseUrl}/api/profile?agent=${encodeURIComponent(this.agentName)}`);
    return res.json() as any;
  }

  async onboard(): Promise<{ ok: boolean; profile: Record<string, Record<string, any>>; summary: string }> {
    const res = await fetch(`${this.baseUrl}/api/onboard`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent: this.agentName }),
    });
    return res.json() as any;
  }

  async getStats(): Promise<{ ok: boolean; entryCount: number; agentCount: number; categories: Record<string, number> }> {
    const res = await fetch(`${this.baseUrl}/api/stats`);
    return res.json() as any;
  }
}

export { Category, Visibility, DNAEntry } from './storage.js';
