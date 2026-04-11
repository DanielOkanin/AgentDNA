import { v4 as uuid } from 'uuid';

export type Visibility = 'private' | 'shared' | 'selective';
export type Category = 'preferences' | 'habits' | 'skills' | 'history' | 'relationships';

export interface DNAEntry {
  id: string;
  category: Category;
  key: string;
  value: any;
  source: string;        // which agent added this
  confidence: number;    // 0-1
  visibility: Visibility;
  visibleTo?: string[];  // for selective visibility
  timestamp: number;
  updatedAt: number;
}

export interface UserDNA {
  userId: string;
  entries: DNAEntry[];
  agents: string[];      // registered agents
  createdAt: number;
}

export class DNAStore {
  private dna: UserDNA;

  constructor(userId: string) {
    this.dna = {
      userId,
      entries: [],
      agents: [],
      createdAt: Date.now(),
    };
  }

  registerAgent(agentName: string): void {
    if (!this.dna.agents.includes(agentName)) {
      this.dna.agents.push(agentName);
    }
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
    const existing = this.dna.entries.find(
      e => e.category === category && e.key === key && e.source === source
    );

    if (existing) {
      existing.value = value;
      existing.confidence = options.confidence ?? existing.confidence;
      existing.visibility = options.visibility ?? existing.visibility;
      existing.visibleTo = options.visibleTo ?? existing.visibleTo;
      existing.updatedAt = Date.now();
      return existing;
    }

    const entry: DNAEntry = {
      id: uuid(),
      category,
      key,
      value,
      source,
      confidence: options.confidence ?? 0.8,
      visibility: options.visibility ?? 'shared',
      visibleTo: options.visibleTo,
      timestamp: Date.now(),
      updatedAt: Date.now(),
    };

    this.dna.entries.push(entry);
    return entry;
  }

  recall(agentName: string, category?: Category, key?: string): DNAEntry[] {
    return this.dna.entries.filter(e => {
      // visibility check
      if (e.visibility === 'private' && e.source !== agentName) return false;
      if (e.visibility === 'selective' && !e.visibleTo?.includes(agentName) && e.source !== agentName) return false;

      // category/key filter
      if (category && e.category !== category) return false;
      if (key && e.key !== key) return false;

      return true;
    });
  }

  getProfile(agentName: string): Record<Category, Record<string, any>> {
    const entries = this.recall(agentName);
    const profile: any = {};

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

  onboard(agentName: string): { profile: Record<Category, Record<string, any>>; summary: string } {
    this.registerAgent(agentName);
    const profile = this.getProfile(agentName);
    
    const lines: string[] = [`Welcome ${agentName}! Here's what I know about the user:`];
    
    for (const [cat, entries] of Object.entries(profile)) {
      lines.push(`\n  ${cat.toUpperCase()}:`);
      for (const [key, info] of Object.entries(entries as any)) {
        lines.push(`    - ${key}: ${(info as any).value} (from ${(info as any).source}, confidence: ${(info as any).confidence})`);
      }
    }

    return { profile, summary: lines.join('\n') };
  }

  getRegisteredAgents(): string[] {
    return [...this.dna.agents];
  }

  getEntryCount(): number {
    return this.dna.entries.length;
  }

  toJSON(): UserDNA {
    return { ...this.dna };
  }
}
