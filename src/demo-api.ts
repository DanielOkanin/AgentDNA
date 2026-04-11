import { createServer } from './server.js';
import { AgentDNAClient } from './sdk.js';

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║        🧬 AgentDNA — Full API Demo          ║');
  console.log('║   "Your agents should already know you"     ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log();

  // Start server
  const { server } = createServer();
  await sleep(500); // Let server start

  const BASE = 'http://localhost:3456';

  // ═══════════════════════════════════════
  // STEP 1: FinanceBot registers and learns
  // ═══════════════════════════════════════
  console.log('━━━ Step 1: FinanceBot joins via API ━━━');
  const financeBot = new AgentDNAClient('FinanceBot', BASE);
  await financeBot.register();

  await financeBot.learn('preferences', 'risk_tolerance', 'conservative', { confidence: 0.95 });
  await financeBot.learn('preferences', 'min_probability', '70%+', { confidence: 0.95 });
  await financeBot.learn('preferences', 'strategy', 'credit_spreads', { confidence: 0.9 });
  await financeBot.learn('preferences', 'market', 'US_options', { confidence: 1.0 });
  await financeBot.learn('habits', 'trading_time', 'checks_after_market_open_16:30_IST', { confidence: 0.8 });
  await financeBot.learn('history', 'first_trade', 'HOOD_bull_put_spread', { confidence: 1.0 });
  await financeBot.learn('preferences', 'budget', 'small_account_under_5000', {
    confidence: 0.7,
    visibility: 'selective',
    visibleTo: ['FinanceBot', 'TaxBot'],
  });

  const financeRecall = await financeBot.recall();
  console.log(`✅ FinanceBot learned ${financeRecall.entries.length} things about user\n`);

  // ═══════════════════════════════════════
  // STEP 2: CodeBot registers and learns
  // ═══════════════════════════════════════
  console.log('━━━ Step 2: CodeBot joins via API ━━━');
  const codeBot = new AgentDNAClient('CodeBot', BASE);
  await codeBot.register();

  await codeBot.learn('skills', 'primary_language', 'Kotlin', { confidence: 0.9 });
  await codeBot.learn('skills', 'secondary_language', 'Python', { confidence: 0.85 });
  await codeBot.learn('skills', 'frameworks', 'Android, Backend, Web', { confidence: 0.9 });
  await codeBot.learn('skills', 'ai_tools', 'Claude Code, OpenClaw', { confidence: 0.95 });
  await codeBot.learn('preferences', 'code_style', 'pragmatic, ships fast', { confidence: 0.8 });
  await codeBot.learn('relationships', 'employer', 'monday.com', { confidence: 1.0 });
  await codeBot.learn('relationships', 'project', 'Taka.ai — AI agents platform', { confidence: 1.0 });
  await codeBot.learn('history', 'career_path', 'Android dev → AI engineer', { confidence: 0.95 });

  // Private knowledge
  await codeBot.learn('history', 'git_struggles', 'sometimes forgets to commit', {
    confidence: 0.6,
    visibility: 'private',
  });

  const codeRecall = await codeBot.recall();
  console.log(`✅ CodeBot learned ${codeRecall.entries.length} things about user\n`);

  // ═══════════════════════════════════════
  // STEP 3: LifeBot onboards
  // ═══════════════════════════════════════
  console.log('━━━ Step 3: LifeBot onboards (brand new agent!) ━━━');
  const lifeBot = new AgentDNAClient('LifeBot', BASE);
  const onboardResult = await lifeBot.onboard();

  console.log(onboardResult.summary);
  console.log();

  // LifeBot recall
  const skills = await lifeBot.recall('skills');
  const prefs = await lifeBot.recall('preferences');

  console.log(`LifeBot already knows:`);
  console.log(`  - User has ${skills.entries.length} skill entries`);
  console.log(`  - User has ${prefs.entries.length} preference entries`);
  console.log();

  // Visibility checks
  const gitStruggles = await lifeBot.recall('history', 'git_struggles');
  console.log(`Can LifeBot see CodeBot's private "git_struggles"? ${gitStruggles.entries.length > 0 ? '❌ YES (BUG!)' : '✅ NO (correct!)'}`);

  const budget = await lifeBot.recall('preferences', 'budget');
  console.log(`Can LifeBot see FinanceBot's selective "budget"? ${budget.entries.length > 0 ? '❌ YES (BUG!)' : '✅ NO (correct!)'}`);
  console.log();

  // ═══════════════════════════════════════
  // STEP 4: Show stats
  // ═══════════════════════════════════════
  console.log('━━━ Step 4: Stats ━━━');
  const stats = await lifeBot.getStats();
  console.log(`Total entries: ${stats.entryCount}`);
  console.log(`Registered agents: ${stats.agentCount}`);
  console.log(`Categories:`, stats.categories);
  console.log();

  // ═══════════════════════════════════════
  // STEP 5: Full profile
  // ═══════════════════════════════════════
  console.log('━━━ Step 5: Full Profile (as seen by LifeBot) ━━━');
  const profile = await lifeBot.getProfile();
  console.log(JSON.stringify(profile.profile, null, 2));

  console.log();
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║  🧬 AgentDNA is running!                    ║');
  console.log('║  📊 Dashboard: http://localhost:3456         ║');
  console.log('║  Press Ctrl+C to stop                       ║');
  console.log('╚══════════════════════════════════════════════╝');

  // Keep server running for dashboard
}

main().catch(err => {
  console.error('Demo failed:', err);
  process.exit(1);
});
