// src/index.ts - v0.5.1-EXACT — React → Think → Reflect → Decide
import { MUDAgent } from './agent/agent.js';
import { MUDClient } from './mud-client/client.js';
import { memorizeFromUser, queryMemoriesByTag } from './memory-store.js';
import { log, banner } from './logger.js';

banner();
log.success('🚀 MUD-AI v0.5.1-EXACT — 4-stage thinking loaded');

const agent = new MUDAgent();
const mud = new MUDClient();
let autoMode = true;
let loggedIn = false;

let fullBuffer = '';
let currentLine = '';
let lastLineTime = Date.now();
let lastActivity = Date.now();

// Memory windows
let ultraShortMemories: string[] = [];   // last 10 seconds (for React)
let recentMemories: string[] = [];       // last 2 minutes (for Think/Reflect)
let persistentMemories: string[] = [];   // loaded from Supabase (life goals, quest, key facts)

async function loadPersistentMemories() {
  // Real DB load - high persistence tag
  persistentMemories = await queryMemoriesByTag('persistent', { limit: 30, minScore: 8 });
  if (persistentMemories.length === 0) {
    persistentMemories = [
      "I am a player in Achaea",
      "Primary goal: Survive, explore, and complete my current quest",
      "I must stay aware of my location, health, and threats"
    ];
  }
  log.success(`📦 Loaded ${persistentMemories.length} persistent memories from Supabase`);
}

async function start() {
  await memorizeFromUser("System prompt: Follow the exact 4-stage thinking system.");
  await loadPersistentMemories();
  loggedIn = true;
  mud.connect();
  log.success('✅ Logged in — 4-stage system active');
}

mud.on('data', (data: string) => {
  if (!autoMode || !loggedIn) return;
  lastActivity = Date.now();

  const lines = data.split('\n');
  lines.forEach(line => {
    if (line.trim()) {
      currentLine = line.trim();
      fullBuffer += line + '\n';
    }
  });
});

// Fast React() — every new line
setInterval(async () => {
  if (!autoMode || !loggedIn || !currentLine) return;

  const now = Date.now();
  if (now - lastLineTime < 80) return; // debounce

  log.info('⚡ React() — line detected');

  const ctx = { ultraShort: ultraShortMemories, persistent: persistentMemories };
  const result = await agent.react(currentLine, ctx);

  if (result.immediateAction) {
    mud.sendCommand(result.immediateAction);
    log.success('🚨 Immediate action taken');
  } else {
    result.observations.forEach(obs => {
      memorizeFromUser(obs);           // saved to Supabase
      recentMemories.push(obs);
      ultraShortMemories.push(obs);
      // duplicate = higher persistence (handled inside memorizeFromUser)
    });
  }

  currentLine = '';
  lastLineTime = now;
  pruneOldMemories();
}, 90);

// Silence detection → Think()
setInterval(async () => {
  if (!autoMode || !loggedIn) return;
  if (Date.now() - lastActivity < 1500) return;
  if (!fullBuffer.trim()) return;

  log.info('🧠 Think() — silence detected');

  const ctx = { recent: recentMemories, persistent: persistentMemories };
  const result = await agent.think(fullBuffer.trim(), ctx);

  // Create memories from observations
  result.observations.forEach(obs => {
    memorizeFromUser(obs);
    recentMemories.push(obs);
  });

  if (result.action) {
    mud.sendCommand(result.action);
    log.success('📤 Direct command from Think()');
  } else if (result.shouldReflect) {
    log.info('🔎 Reflect() triggered');
    const queries = await agent.reflect({ recent: recentMemories, persistent: persistentMemories });
    const retrieved = await agent.queryMemories(queries);   // actual DB lookup
    const decision = await agent.decide(retrieved, { context: fullBuffer });
    if (decision.command) {
      mud.sendCommand(decision.command);
      log.success('📤 Decide() → command sent');
    }
  }

  fullBuffer = '';        // clear after Think()
  pruneOldMemories();
}, 300);

// Helper
function pruneOldMemories() {
  const now = Date.now();
  ultraShortMemories = ultraShortMemories.slice(-15);   // ~10s worth
  recentMemories = recentMemories.slice(-80);           // ~2min worth
}

// CLI
mud.onCLICommand = async (input: string) => {
  const c = input.trim();
  if (c === '!login') { await start(); return; }
  if (c === '!auto') { autoMode = !autoMode; log.success(`Autopilot ${autoMode ? 'ON' : 'OFF'}`); return; }
  if (c === '!cls') { console.clear(); return; }
  if (loggedIn) mud.sendCommand({ action: 'send_command', command: c });
};

log.success('Ready. Type !login to start the exact 4-stage system.');