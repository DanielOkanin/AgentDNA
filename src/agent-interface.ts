import { DNAStore, Category, Visibility } from './dna-store.js';

export class AgentInterface {
  private store: DNAStore;
  public name: string;

  constructor(name: string, store: DNAStore) {
    this.name = name;
    this.store = store;
    this.store.registerAgent(name);
  }

  learn(
    category: Category,
    key: string,
    value: any,
    options: {
      confidence?: number;
      visibility?: Visibility;
      visibleTo?: string[];
    } = {}
  ) {
    return this.store.learn(category, key, value, this.name, options);
  }

  recall(category?: Category, key?: string) {
    return this.store.recall(this.name, category, key);
  }

  getProfile() {
    return this.store.getProfile(this.name);
  }

  static onboard(name: string, store: DNAStore) {
    const { profile, summary } = store.onboard(name);
    const agent = new AgentInterface(name, store);
    return { agent, profile, summary };
  }
}
