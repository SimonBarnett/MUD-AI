// src/index.ts - v0.5.5 — React → Think → Reflect → Decide (Full Interactive CLI)
import { MUDAgent } from './agent/agent.js';
import { MUDClient } from './mud-client/client.js';
import {
  memorizeFromUser,
  queryMemoriesByTag,
} from './memory-store.js';
import { log, banner } from './logger.js';

// Clear screen before anything
console.clear();

banner();
log.success('🚀 MUD-AI v0.5.5 — 4-Stage Thinking System ready');

const agent = new MUDAgent();
const mud = new MUDClient();

let autoMode = true;
let loggedIn = false;
let debugMode = false;

let fullBuffer = '';
let currentLine = '';
let lastLineTime = Date.now();
let lastActivity = Date.now();

// Memory windows
let ultraShortMemories: string[] = [];   // last ~10s (React)
let recentMemories: string[] = [];       // last ~2min (Think/Reflect)
let persistentMemories: string[] = [];   // long-term from Supabase

// ==================== PERSISTENT MEMORIES ====================
async function loadPersistentMemories() {
  try {
    persistentMemories = await queryMemoriesByTag('persistent');

    if (persistentMemories.length === 0) {
      persistentMemories = [
        "I am a player in Achaea",
        "Primary goal: Survive, explore, and complete my current quest",
        "I must stay aware of my location, health, and threats"
      ];
    }
    log.success(`📦 Loaded ${persistentMemories.length} persistent memories from Supabase`);
  } catch (e: any) {
    log.error('Failed to load persistent memories:', e.message);
    persistentMemories = [
      "I am a player in Achaea",
      "Primary goal: Survive, explore, and complete my current quest"
    ];
  }
}

// ==================== START / CONNECT ====================
async function start() {
  await memorizeFromUser("System prompt: Follow the exact 4-stage thinking system (React → Think → Reflect → Decide).");
  await loadPersistentMemories();
  loggedIn = true;
  mud.connect();
  log.success('✅ Connected — 4-stage autopilot is now active');
}

// ==================== GAME DATA HANDLER ====================
mud.on('data', (data: string) => {
  if (!autoMode || !loggedIn) return;
  lastActivity = Date.now();

  const lines = data.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed) {
      currentLine = trimmed;
      fullBuffer += line + '\n';
    }
  }
});

// ==================== REACT() — every new line ====================
setInterval(async () => {
  if (!autoMode || !loggedIn || !currentLine) return;

  const now = Date.now();
  if (now - lastLineTime < 80) return; // debounce

  if (debugMode) log.info('⚡ React() triggered');

  const ctx = { ultraShort: ultraShortMemories, persistent: persistentMemories };
  const result = await agent.react(currentLine, ctx);

  if (result.immediateAction) {
    mud.sendCommand(result.immediateAction);
    log.success(`🚨 Immediate action: ${result.immediateAction}`);
  } else {
    for (const obs of result.observations) {
      await memorizeFromUser(obs);
      recentMemories.push(obs);
      ultraShortMemories.push(obs);
    }
  }

  currentLine = '';
  lastLineTime = now;
  pruneOldMemories();
}, 90);

// ==================== THINK() — on silence ====================
setInterval(async () => {
  if (!autoMode || !loggedIn) return;
  if (Date.now() - lastActivity < 1500) return;
  if (!fullBuffer.trim()) return;

  if (debugMode) log.info('🧠 Think() triggered');

  const ctx = { recent: recentMemories, persistent: persistentMemories };
  const result = await agent.think(fullBuffer.trim(), ctx);

  for (const obs of result.observations) {
    await memorizeFromUser(obs);
    recentMemories.push(obs);
  }

  if (result.action) {
    mud.sendCommand(result.action);
    log.success(`📤 Think() → ${result.action}`);
  } else if (result.shouldReflect) {
    if (debugMode) log.info('🔎 Reflect() triggered from Think()');
    await doReflectAndDecide();
  }

  fullBuffer = '';
  pruneOldMemories();
}, 300);

// ==================== REFLECT + DECIDE ====================
async function doReflectAndDecide() {
  const queries = await agent.reflect({ recent: recentMemories, persistent: persistentMemories });
  const retrieved = await agent.queryMemories(queries);
  const decision = await agent.decide(retrieved, { context: fullBuffer });

  if (decision.command) {
    mud.sendCommand(decision.command);
    log.success(`📤 Decide() → ${decision.command}`);
  }
}

// ==================== HELPERS ====================
function pruneOldMemories() {
  ultraShortMemories = ultraShortMemories.slice(-15);
  recentMemories = recentMemories.slice(-80);
}

function showRules() {
  console.log(`
╔════════════════════════════════════════════════════════════════════════════╗
║                        MUD-AI 4-STAGE THINKING RULES                       ║
╠════════════════════════════════════════════════════════════════════════════╣
║  1. REACT()     → Instant reaction to new lines (every ~90ms)              ║
║  2. THINK()     → Deeper analysis when the game goes silent (~1.5s)        ║
║  3. REFLECT()   → Query long-term memory when THINK() needs more context   ║
║  4. DECIDE()    → Final action after reflection                            ║
║                                                                            ║
║  • Ultra-short memory = last ~10 seconds                                   ║
║  • Recent memory      = last ~2 minutes                                    ║
║  • Persistent memory  = loaded from Supabase (life goals, quests, facts)   ║
║  • Type !memorize <text> to manually save important information            ║
╚════════════════════════════════════════════════════════════════════════════╝
`);
}

function showHelp() {
  console.log(`
╔════════════════════════════════════════════════════════════════════════════╗
║                         MUD-AI v0.5.5 — AVAILABLE COMMANDS                 ║
╠════════════════════════════════════════════════════════════════════════════╣
║  !help, !h          → Show this help                                       ║
║  !rules             → Show the 4-stage thinking rules                      ║
║  !connect, !login   → Connect to MUD + load persistent memories            ║
║  !auto              → Toggle autopilot (React / Think / Reflect / Decide)  ║
║  !status, !st       → Show current state + memory counts                   ║
║  !memory, !mem      → Dump persistent + recent + ultra-short memories      ║
║  !memorize <text>   → Manually save something to long-term memory          ║
║  !think             → Manually trigger Think() stage                       ║
║  !reflect           → Manually trigger Reflect + Decide                    ║
║  !debug             → Toggle debug logging                                 ║
║  !cls, !clear       → Clear the console                                    ║
║  !quit, !exit       → Exit MUD-AI                                          ║
╠════════════════════════════════════════════════════════════════════════════╣
║  Any other text     → Sent directly as a command to the MUD                ║
╚════════════════════════════════════════════════════════════════════════════╝
`);
}

function showStatus() {
  console.log(`
┌────────────────────────────────────────────────────────────────────────────┐
│  MUD-AI v0.5.5 Status                                                      │
├────────────────────────────────────────────────────────────────────────────┤
│  Autopilot:     ${autoMode ? '✅ ON' : '❌ OFF'}                                                    │
│  Connected:     ${loggedIn ? '✅ YES' : '❌ NO'}                                                    │
│  Debug mode:    ${debugMode ? '✅ ON' : '❌ OFF'}                                                    │
├────────────────────────────────────────────────────────────────────────────┤
│  Ultra-short memories: ${ultraShortMemories.length.toString().padEnd(3)} (last ~10 seconds)             │
│  Recent memories:      ${recentMemories.length.toString().padEnd(3)} (last ~2 minutes)               │
│  Persistent memories:  ${persistentMemories.length.toString().padEnd(3)} (from Supabase)             │
└────────────────────────────────────────────────────────────────────────────┘
`);
}

async function showMemories() {
  console.log('\n📦 === PERSISTENT MEMORIES (from Supabase) ===');
  persistentMemories.forEach((m, i) => console.log(`  ${i + 1}. ${m}`));

  console.log('\n🧠 === RECENT MEMORIES (last 10) ===');
  recentMemories.slice(-10).forEach((m, i) => console.log(`  ${i + 1}. ${m}`));

  console.log('\n⚡ === ULTRA-SHORT MEMORIES (last 5) ===');
  ultraShortMemories.slice(-5).forEach((m, i) => console.log(`  ${i + 1}. ${m}`));
  console.log('');
}

// ==================== CLI COMMAND HANDLER ====================
mud.onCLICommand = async (input: string) => {
  const c = input.trim().toLowerCase();

  if (c === '!help' || c === '!h') {
    showHelp();
    return;
  }

  if (c === '!rules') {
    showRules();
    return;
  }

  if (c === '!connect' || c === '!login') {
    await start();
    return;
  }

  if (c === '!auto' || c === '!autopilot') {
    autoMode = !autoMode;
    log.success(`Autopilot ${autoMode ? '✅ ENABLED' : '❌ DISABLED'}`);
    return;
  }

  if (c === '!status' || c === '!st') {
    showStatus();
    return;
  }

  if (c === '!memory' || c === '!mem') {
    await showMemories();
    return;
  }

  if (c.startsWith('!memorize ')) {
    const text = input.slice(10).trim();
    if (!text) {
      log.warn('Usage: !memorize <text you want to remember>');
      return;
    }
    await memorizeFromUser(text, { type: 'manual', boost: true });
    log.success(`💾 Manually memorized: ${text}`);
    return;
  }

  if (c === '!think') {
    if (!fullBuffer.trim()) {
      log.warn('No game output in buffer yet. Wait for some MUD text first.');
      return;
    }
    log.info('🧠 Manual Think() triggered...');
    const ctx = { recent: recentMemories, persistent: persistentMemories };
    const result = await agent.think(fullBuffer.trim(), ctx);
    console.log('Think() result:', result);
    return;
  }

  if (c === '!reflect') {
    log.info('🔎 Manual Reflect + Decide triggered...');
    await doReflectAndDecide();
    return;
  }

  if (c === '!debug') {
    debugMode = !debugMode;
    log.success(`Debug mode ${debugMode ? '✅ ON' : '❌ OFF'}`);
    return;
  }

  if (c === '!cls' || c === '!clear') {
    console.clear();
    return;
  }

  if (c === '!quit' || c === '!exit') {
    log.success('👋 Shutting down MUD-AI...');
    process.exit(0);
  }

  // Default → send to MUD
  if (loggedIn) {
    mud.sendCommand({ action: 'send_command', command: input });
  } else {
    log.warn('Not connected yet. Type !connect or !login first.');
  }
};

// ==================== BOOT ====================
showHelp();
log.success('Type !help for commands • !connect to start • !rules to see the thinking system');