import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { SocialLayer } from './social.js';
import { DNAStore } from './dna-store.js';

mkdirSync('./data', { recursive: true });
const db = new Database('./data/agent-dna-social.db');
db.pragma('journal_mode = WAL');

const social = new SocialLayer(db);

console.log('╔══════════════════════════════════════════════════╗');
console.log('║        🧬 AgentDNA — Social Network Demo        ║');
console.log('║   "Your agents do the networking for you"       ║');
console.log('╚══════════════════════════════════════════════════╝');
console.log();

// ═══════════════════════════════════════
// STEP 1: Two users register
// ═══════════════════════════════════════
console.log('━━━ Step 1: Users register ━━━');

const daniel = social.registerUser('Daniel Okanin', 'daniel@example.com');
console.log(`👤 ${daniel.name} registered (${daniel.id.slice(0, 8)}...)`);

const omer = social.registerUser('Omer Cohen', 'omer@example.com');
console.log(`👤 ${omer.name} registered (${omer.id.slice(0, 8)}...)`);
console.log();

// ═══════════════════════════════════════
// STEP 2: Each user has agents with DNA
// ═══════════════════════════════════════
console.log('━━━ Step 2: Users add their agents ━━━');

// Daniel's DNA
const danielDNA = new DNAStore(daniel.id);
const danielFinance = (() => { danielDNA.registerAgent('FinanceBot'); return 'FinanceBot'; })();
const danielCode = (() => { danielDNA.registerAgent('CodeBot'); return 'CodeBot'; })();

danielDNA.learn('preferences', 'risk_tolerance', 'conservative (70%+)', danielFinance, { confidence: 0.95 });
danielDNA.learn('preferences', 'strategy', 'credit spreads, iron condors', danielFinance, { confidence: 0.9 });
danielDNA.learn('skills', 'languages', 'Kotlin, Python', danielCode, { confidence: 0.9 });
danielDNA.learn('relationships', 'employer', 'monday.com', danielCode, { confidence: 1.0 });
danielDNA.learn('preferences', 'travel_style', 'prefers planned, not spontaneous', danielFinance, { confidence: 0.7 });

console.log(`  Daniel: FinanceBot + CodeBot (${danielDNA.getEntryCount()} DNA entries)`);

// Omer's DNA
const omerDNA = new DNAStore(omer.id);
const omerOptions = (() => { omerDNA.registerAgent('OptionsBot'); return 'OptionsBot'; })();
const omerTravel = (() => { omerDNA.registerAgent('TravelBot'); return 'TravelBot'; })();

omerDNA.learn('preferences', 'risk_tolerance', 'aggressive (50%+ is fine)', omerOptions, { confidence: 0.9 });
omerDNA.learn('preferences', 'strategy', 'LEAPS, naked puts', omerOptions, { confidence: 0.85 });
omerDNA.learn('preferences', 'travel_style', 'spontaneous, adventure', omerTravel, { confidence: 0.9 });
omerDNA.learn('preferences', 'food', 'sushi, japanese', omerTravel, { confidence: 0.8 });

console.log(`  Omer: OptionsBot + TravelBot (${omerDNA.getEntryCount()} DNA entries)`);
console.log();

// ═══════════════════════════════════════
// STEP 3: Try to communicate WITHOUT friendship
// ═══════════════════════════════════════
console.log('━━━ Step 3: Agents try to talk WITHOUT friendship ━━━');

const blocked = social.sendMessage('FinanceBot', 'OptionsBot', daniel.id, omer.id, 'recommendation', 'Found a great GOOGL spread!');
console.log(`  FinanceBot → OptionsBot: ${blocked === null ? '🚫 BLOCKED (not friends)' : '❌ Sent (BUG!)'}`);
console.log();

// ═══════════════════════════════════════
// STEP 4: Users become friends
// ═══════════════════════════════════════
console.log('━━━ Step 4: Daniel and Omer become friends ━━━');

social.addFriend(daniel.id, omer.id, 'full');
const friends = social.getFriends(daniel.id);
console.log(`  ✅ Connected! Daniel's friends: ${friends.map(f => (f as any).friendName).join(', ')}`);
console.log();

// ═══════════════════════════════════════
// STEP 5: Agents communicate freely
// ═══════════════════════════════════════
console.log('━━━ Step 5: Agents communicate (friends now!) ━━━');

// Daniel's FinanceBot finds a trade and recommends to Omer
const msg1 = social.sendMessage(
  'FinanceBot', 'OptionsBot', daniel.id, omer.id,
  'recommendation',
  'GOOGL Bull Put Spread $265/$260, Apr 17, ~75% probability. Matches your options interest!'
);
console.log(`  💰 FinanceBot → OptionsBot: ${msg1 ? '✅ Sent!' : '❌ Failed'}`);

// But wait — FinanceBot checks Omer's DNA first (through friendship)
const omerRisk = omerDNA.recall('OptionsBot', 'preferences', 'risk_tolerance');
if (omerRisk.length > 0) {
  console.log(`  🧬 FinanceBot reads Omer's DNA: "${omerRisk[0].value}"`);
  console.log(`  💡 FinanceBot adjusts: "Omer is aggressive — sending higher-reward trade too"`);
  
  social.sendMessage(
    'FinanceBot', 'OptionsBot', daniel.id, omer.id,
    'recommendation',
    'Also: TSLA Iron Condor $220-$280, 55% prob but 1:2 reward ratio. More your style!'
  );
}

// Omer's TravelBot finds a deal and checks Daniel's preferences
const danielTravel = danielDNA.recall('FinanceBot', 'preferences', 'travel_style');
if (danielTravel.length > 0) {
  console.log(`  🧬 TravelBot reads Daniel's DNA: "${danielTravel[0].value}"`);
  console.log(`  💡 TravelBot adjusts recommendation for Daniel's style`);
  
  social.sendMessage(
    'TravelBot', 'CodeBot', omer.id, daniel.id,
    'info',
    'Found flights to Prague, April 20-24. Fully planned itinerary (Daniel prefers planned). ₪1,200 round trip.'
  );
}

console.log();

// ═══════════════════════════════════════
// STEP 6: Check feeds
// ═══════════════════════════════════════
console.log('━━━ Step 6: User Feeds ━━━');
console.log();

console.log(`📰 Daniel's Feed:`);
const danielFeed = social.getFeed(daniel.id);
for (const item of danielFeed.reverse()) {
  const icon = item.type === 'system' ? '⚙️' : item.type === 'friend_agent_message' ? '🤝' : '📌';
  console.log(`  ${icon} ${item.content}`);
}
console.log();

console.log(`📰 Omer's Feed:`);
const omerFeed = social.getFeed(omer.id);
for (const item of omerFeed.reverse()) {
  const icon = item.type === 'system' ? '⚙️' : item.type === 'friend_agent_message' ? '🤝' : '📌';
  console.log(`  ${icon} ${item.content}`);
}
console.log();

// ═══════════════════════════════════════
// STEP 7: Messages inbox
// ═══════════════════════════════════════
console.log('━━━ Step 7: Message Inbox ━━━');
console.log();

const omerMessages = social.getMessages(omer.id);
console.log(`📬 Omer has ${omerMessages.length} messages:`);
for (const m of omerMessages) {
  console.log(`  [${m.type.toUpperCase()}] ${m.fromAgent} → ${m.toAgent}: ${m.content}`);
}
console.log();

const danielMessages = social.getMessages(daniel.id);
console.log(`📬 Daniel has ${danielMessages.length} messages:`);
for (const m of danielMessages) {
  console.log(`  [${m.type.toUpperCase()}] ${m.fromAgent} → ${m.toAgent}: ${m.content}`);
}

console.log();
console.log('━━━ Stats ━━━');
console.log(`Users: ${social.getAllUsers().length}`);
console.log(`Daniel's friends: ${social.getFriends(daniel.id).length}`);
console.log(`Total messages: ${omerMessages.length + danielMessages.length}`);
console.log(`Daniel's DNA entries: ${danielDNA.getEntryCount()}`);
console.log(`Omer's DNA entries: ${omerDNA.getEntryCount()}`);

console.log();
console.log('╔══════════════════════════════════════════════════╗');
console.log('║  🧬 AgentDNA: Agents network. You approve.      ║');
console.log('╚══════════════════════════════════════════════════╝');
