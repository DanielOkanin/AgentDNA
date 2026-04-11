import { DNAStore } from './dna-store.js';
import { AgentInterface } from './agent-interface.js';

console.log('╔══════════════════════════════════════════════╗');
console.log('║           🧬 AgentDNA — MVP Demo            ║');
console.log('║   "Your agents should already know you"     ║');
console.log('╚══════════════════════════════════════════════╝');
console.log();

// Create DNA store for a user
const dna = new DNAStore('daniel-okanin');

// ═══════════════════════════════════════
// STEP 1: FinanceBot joins and learns
// ═══════════════════════════════════════
console.log('━━━ Step 1: FinanceBot joins ━━━');
const financeBot = new AgentInterface('FinanceBot', dna);

financeBot.learn('preferences', 'risk_tolerance', 'conservative', { confidence: 0.95 });
financeBot.learn('preferences', 'min_probability', '70%+', { confidence: 0.95 });
financeBot.learn('preferences', 'strategy', 'credit_spreads', { confidence: 0.9 });
financeBot.learn('preferences', 'market', 'US_options', { confidence: 1.0 });
financeBot.learn('habits', 'trading_time', 'checks_after_market_open_16:30_IST', { confidence: 0.8 });
financeBot.learn('history', 'first_trade', 'HOOD_bull_put_spread', { confidence: 1.0 });
financeBot.learn('preferences', 'budget', 'small_account_under_5000', { 
  confidence: 0.7, 
  visibility: 'selective', 
  visibleTo: ['FinanceBot', 'TaxBot'] 
});

console.log(`✅ FinanceBot learned ${financeBot.recall().length} things about user\n`);

// ═══════════════════════════════════════
// STEP 2: CodeBot joins and learns
// ═══════════════════════════════════════
console.log('━━━ Step 2: CodeBot joins ━━━');
const codeBot = new AgentInterface('CodeBot', dna);

codeBot.learn('skills', 'primary_language', 'Kotlin', { confidence: 0.9 });
codeBot.learn('skills', 'secondary_language', 'Python', { confidence: 0.85 });
codeBot.learn('skills', 'frameworks', 'Android, Backend, Web', { confidence: 0.9 });
codeBot.learn('skills', 'ai_tools', 'Claude Code, OpenClaw', { confidence: 0.95 });
codeBot.learn('preferences', 'code_style', 'pragmatic, ships fast', { confidence: 0.8 });
codeBot.learn('relationships', 'employer', 'monday.com', { confidence: 1.0 });
codeBot.learn('relationships', 'project', 'Taka.ai — AI agents platform', { confidence: 1.0 });
codeBot.learn('history', 'career_path', 'Android dev → AI engineer', { confidence: 0.95 });

// Private knowledge — only CodeBot sees this
codeBot.learn('history', 'git_struggles', 'sometimes forgets to commit', { 
  confidence: 0.6, 
  visibility: 'private' 
});

console.log(`✅ CodeBot learned ${codeBot.recall().length} things about user\n`);

// ═══════════════════════════════════════
// STEP 3: New agent "LifeBot" onboards
// ═══════════════════════════════════════
console.log('━━━ Step 3: LifeBot onboards (brand new agent!) ━━━');
const { agent: lifeBot, summary } = AgentInterface.onboard('LifeBot', dna);

console.log(summary);
console.log();

// LifeBot can immediately use this knowledge
const skills = lifeBot.recall('skills');
const prefs = lifeBot.recall('preferences');

console.log(`LifeBot already knows:`);
console.log(`  - User has ${skills.length} skill entries`);
console.log(`  - User has ${prefs.length} preference entries`);
console.log();

// LifeBot should NOT see private CodeBot data
const gitStruggles = lifeBot.recall('history', 'git_struggles');
console.log(`Can LifeBot see CodeBot's private "git_struggles"? ${gitStruggles.length > 0 ? '❌ YES (BUG!)' : '✅ NO (correct!)'}`);

// LifeBot should NOT see selective FinanceBot data
const budget = lifeBot.recall('preferences', 'budget');
console.log(`Can LifeBot see FinanceBot's selective "budget"? ${budget.length > 0 ? '❌ YES (BUG!)' : '✅ NO (correct!)'}`);

console.log();

// ═══════════════════════════════════════
// STEP 4: Show full DNA
// ═══════════════════════════════════════
console.log('━━━ Step 4: Full DNA Profile (as seen by LifeBot) ━━━');
const profile = lifeBot.getProfile();
console.log(JSON.stringify(profile, null, 2));

console.log();
console.log('━━━ Stats ━━━');
console.log(`Total entries: ${dna.getEntryCount()}`);
console.log(`Registered agents: ${dna.getRegisteredAgents().join(', ')}`);

console.log();
console.log('╔══════════════════════════════════════════════╗');
console.log('║  🧬 AgentDNA: Your agents already know you  ║');
console.log('╚══════════════════════════════════════════════╝');
