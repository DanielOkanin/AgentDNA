import express from 'express';
import Database from 'better-sqlite3';
import { mkdirSync, existsSync } from 'fs';
import path from 'path';
import { SocialLayer } from './social.js';
import { DNAStore } from './dna-store.js';

mkdirSync('./data', { recursive: true });
const db = new Database('./data/agent-dna.db');
db.pragma('journal_mode = WAL');

const social = new SocialLayer(db);

// Seed demo data
const daniel = social.registerUser('Daniel Okanin', 'daniel@agentdna.io');
const omer = social.registerUser('Omer Cohen', 'omer@agentdna.io');

const danielDNA = new DNAStore(daniel.id);
danielDNA.registerAgent('FinanceBot');
danielDNA.registerAgent('CodeBot');
danielDNA.learn('preferences', 'risk_tolerance', 'conservative (70%+)', 'FinanceBot', { confidence: 0.95 });
danielDNA.learn('preferences', 'strategy', 'credit spreads', 'FinanceBot', { confidence: 0.9 });
danielDNA.learn('preferences', 'market', 'US options', 'FinanceBot', { confidence: 1.0 });
danielDNA.learn('skills', 'languages', 'Kotlin, Python', 'CodeBot', { confidence: 0.9 });
danielDNA.learn('skills', 'frameworks', 'Android, Backend, Web', 'CodeBot', { confidence: 0.9 });
danielDNA.learn('relationships', 'employer', 'monday.com', 'CodeBot', { confidence: 1.0 });
danielDNA.learn('relationships', 'project', 'Taka.ai', 'CodeBot', { confidence: 1.0 });
danielDNA.learn('history', 'career', 'Android dev → AI Engineer', 'CodeBot', { confidence: 0.95 });

const omerDNA = new DNAStore(omer.id);
omerDNA.registerAgent('OptionsBot');
omerDNA.registerAgent('TravelBot');
omerDNA.learn('preferences', 'risk_tolerance', 'aggressive (50%+)', 'OptionsBot', { confidence: 0.9 });
omerDNA.learn('preferences', 'strategy', 'LEAPS, naked puts', 'OptionsBot', { confidence: 0.85 });
omerDNA.learn('preferences', 'food', 'sushi, japanese', 'TravelBot', { confidence: 0.8 });

social.addFriend(daniel.id, omer.id, 'full');

social.sendMessage('FinanceBot', 'OptionsBot', daniel.id, omer.id, 'recommendation',
  'GOOGL Bull Put Spread $265/$260, Apr 17, ~75% probability');
social.sendMessage('FinanceBot', 'OptionsBot', daniel.id, omer.id, 'recommendation',
  'TSLA Iron Condor $220-$280, 55% prob, 1:2 reward. More your style!');
social.sendMessage('TravelBot', 'CodeBot', omer.id, daniel.id, 'info',
  'Prague flights Apr 20-24, ₪1,200. Planned itinerary (matches your style).');

// Express app
const app = express();
app.use(express.json());

// API
app.get('/api/users', (_req, res) => res.json(social.getAllUsers()));
app.get('/api/users/:id/friends', (req, res) => res.json(social.getFriends(req.params.id)));
app.get('/api/users/:id/feed', (req, res) => res.json(social.getFeed(req.params.id)));
app.get('/api/users/:id/messages', (req, res) => res.json(social.getMessages(req.params.id)));
app.get('/api/users/:id/dna', (req, res) => {
  const dna = req.params.id === daniel.id ? danielDNA : omerDNA;
  const agentName = (req.query.agent as string) || dna.getRegisteredAgents()[0];
  res.json(dna.getProfile(agentName));
});
app.get('/api/users/:id/agents', (req, res) => {
  const dna = req.params.id === daniel.id ? danielDNA : omerDNA;
  res.json(dna.getRegisteredAgents());
});

// Dashboard HTML
app.get('/', (_req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>🧬 AgentDNA</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0a0a0f; color: #e0e0e0; padding: 16px; }
  h1 { text-align: center; font-size: 24px; margin-bottom: 8px; }
  .subtitle { text-align: center; color: #888; margin-bottom: 20px; font-size: 14px; }
  .tabs { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
  .tab { padding: 8px 16px; background: #1a1a2e; border: 1px solid #333; border-radius: 8px; cursor: pointer; font-size: 14px; color: #ccc; }
  .tab.active { background: #4a00e0; border-color: #6a3de8; color: white; }
  .card { background: #12121f; border: 1px solid #222; border-radius: 12px; padding: 16px; margin-bottom: 12px; }
  .card h3 { font-size: 16px; margin-bottom: 8px; color: #8b5cf6; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 11px; margin: 2px; }
  .badge-shared { background: #1a3a1a; color: #4ade80; }
  .badge-private { background: #3a1a1a; color: #f87171; }
  .badge-agent { background: #1a1a3a; color: #60a5fa; }
  .entry { padding: 8px 0; border-bottom: 1px solid #1a1a2e; }
  .entry:last-child { border: none; }
  .key { color: #8b5cf6; font-weight: 600; }
  .value { color: #e0e0e0; }
  .source { color: #666; font-size: 12px; }
  .conf { display: inline-block; width: 60px; height: 6px; background: #1a1a2e; border-radius: 3px; overflow: hidden; vertical-align: middle; margin-left: 8px; }
  .conf-fill { height: 100%; border-radius: 3px; }
  .feed-item { padding: 10px 0; border-bottom: 1px solid #1a1a2e; }
  .feed-icon { margin-right: 8px; }
  .msg { padding: 10px; background: #1a1a2e; border-radius: 8px; margin-bottom: 8px; }
  .msg-type { font-size: 11px; text-transform: uppercase; color: #8b5cf6; }
  .msg-route { font-size: 12px; color: #666; }
  .user-select { display: flex; justify-content: center; gap: 8px; margin-bottom: 16px; }
  .user-btn { padding: 10px 20px; background: #1a1a2e; border: 2px solid #333; border-radius: 10px; cursor: pointer; color: #ccc; font-size: 14px; }
  .user-btn.active { border-color: #8b5cf6; background: #1a1a3e; color: white; }
  .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap: 8px; margin-bottom: 16px; }
  .stat { text-align: center; background: #12121f; border: 1px solid #222; border-radius: 10px; padding: 12px; }
  .stat-num { font-size: 24px; font-weight: 700; color: #8b5cf6; }
  .stat-label { font-size: 11px; color: #666; }
  .section { display: none; }
  .section.active { display: block; }
  .friend { display: flex; align-items: center; gap: 12px; padding: 8px 0; }
  .friend-avatar { width: 36px; height: 36px; background: #4a00e0; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 16px; }
</style>
</head>
<body>
<h1>🧬 AgentDNA</h1>
<p class="subtitle">Your agents already know you</p>

<div class="user-select" id="userSelect"></div>
<div class="stats" id="stats"></div>
<div class="tabs" id="tabs">
  <div class="tab active" onclick="showSection('dna')">🧬 DNA</div>
  <div class="tab" onclick="showSection('agents')">🤖 Agents</div>
  <div class="tab" onclick="showSection('friends')">🤝 Friends</div>
  <div class="tab" onclick="showSection('feed')">📰 Feed</div>
  <div class="tab" onclick="showSection('messages')">📬 Messages</div>
</div>

<div id="dna" class="section active"></div>
<div id="agents" class="section"></div>
<div id="friends" class="section"></div>
<div id="feed" class="section"></div>
<div id="messages" class="section"></div>

<script>
let users = [];
let currentUser = null;

async function init() {
  users = await (await fetch('/api/users')).json();
  const sel = document.getElementById('userSelect');
  sel.innerHTML = users.map(u => 
    '<div class="user-btn" onclick="selectUser(\\'' + u.id + '\\')">' + '👤 ' + u.name + '</div>'
  ).join('');
  if (users.length) selectUser(users[0].id);
}

async function selectUser(id) {
  currentUser = id;
  document.querySelectorAll('.user-btn').forEach((b, i) => {
    b.classList.toggle('active', users[i].id === id);
  });
  await loadAll();
}

async function loadAll() {
  const id = currentUser;
  const [dna, agents, friends, feed, msgs] = await Promise.all([
    fetch('/api/users/'+id+'/dna').then(r=>r.json()),
    fetch('/api/users/'+id+'/agents').then(r=>r.json()),
    fetch('/api/users/'+id+'/friends').then(r=>r.json()),
    fetch('/api/users/'+id+'/feed').then(r=>r.json()),
    fetch('/api/users/'+id+'/messages').then(r=>r.json()),
  ]);
  
  // Stats
  const entries = Object.values(dna).reduce((n, cat) => n + Object.keys(cat).length, 0);
  document.getElementById('stats').innerHTML = 
    '<div class="stat"><div class="stat-num">'+entries+'</div><div class="stat-label">DNA Entries</div></div>' +
    '<div class="stat"><div class="stat-num">'+agents.length+'</div><div class="stat-label">Agents</div></div>' +
    '<div class="stat"><div class="stat-num">'+friends.length+'</div><div class="stat-label">Friends</div></div>' +
    '<div class="stat"><div class="stat-num">'+msgs.length+'</div><div class="stat-label">Messages</div></div>';

  // DNA
  let dnaHtml = '';
  for (const [cat, entries] of Object.entries(dna)) {
    dnaHtml += '<div class="card"><h3>'+cat.toUpperCase()+'</h3>';
    for (const [key, info] of Object.entries(entries)) {
      const conf = Math.round(info.confidence * 100);
      const color = conf > 80 ? '#4ade80' : conf > 60 ? '#fbbf24' : '#f87171';
      dnaHtml += '<div class="entry"><span class="key">'+key+':</span> <span class="value">'+info.value+'</span> <span class="source">via '+info.source+'</span><div class="conf"><div class="conf-fill" style="width:'+conf+'%;background:'+color+'"></div></div></div>';
    }
    dnaHtml += '</div>';
  }
  document.getElementById('dna').innerHTML = dnaHtml || '<div class="card">No DNA entries yet</div>';

  // Agents  
  document.getElementById('agents').innerHTML = agents.map(a => 
    '<div class="card"><h3>🤖 '+a+'</h3><span class="badge badge-agent">Active</span></div>'
  ).join('');

  // Friends
  document.getElementById('friends').innerHTML = friends.length ? friends.map(f =>
    '<div class="card"><div class="friend"><div class="friend-avatar">👤</div><div><strong>'+(f.friendName||f.friendId)+'</strong><br><span class="source">Permission: '+f.permission+'</span></div></div></div>'
  ).join('') : '<div class="card">No friends yet</div>';

  // Feed
  document.getElementById('feed').innerHTML = feed.length ? feed.map(f => {
    const icon = f.type==='system'?'⚙️':f.type==='friend_agent_message'?'🤝':'📌';
    return '<div class="card"><div class="feed-item"><span class="feed-icon">'+icon+'</span>'+f.content+'</div></div>';
  }).join('') : '<div class="card">Feed is empty</div>';

  // Messages
  document.getElementById('messages').innerHTML = msgs.length ? msgs.map(m =>
    '<div class="msg"><div class="msg-type">'+m.type+'</div><div class="msg-route">'+m.fromAgent+' → '+m.toAgent+'</div><div>'+m.content+'</div></div>'
  ).join('') : '<div class="card">No messages</div>';
}

function showSection(name) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.getElementById(name).classList.add('active');
  event.target.classList.add('active');
}

init();
setInterval(loadAll, 5000);
</script>
</body>
</html>`);
});

const PORT = 3456;
app.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('🧬 AgentDNA Dashboard is running!');
  console.log('');
  console.log('   Local:   http://localhost:' + PORT);
  console.log('   Network: http://192.168.1.62:' + PORT);
  console.log('');
  console.log('   Open on your phone! 📱');
  console.log('');
});
