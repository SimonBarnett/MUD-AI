// src/index.ts
// ==================== SILENCE ALL AI DEBUG OUTPUT ====================
process.env.DEBUG = '';
process.env.OPENAI_LOG = 'none';
process.env.NODE_DEBUG = '';

// Force silence before any imports that might use debug
import debug from 'debug';
debug.disable();

// Now safe to import everything else
import 'dotenv/config';
import readline from 'readline';
import fs from 'fs';
import path from 'path';
import { MUDAgent } from './agent/agent.js';
import { MUDClient } from './mud-client/client.js';
import {
  storeMemory,
  getRecentMemories,
} from './context-engine/memory.js';
import { log, banner } from './logger.js';

// ==================== PER-RUN LOG FOLDER SETUP ====================
const logsRoot = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsRoot)) {
  fs.mkdirSync(logsRoot, { recursive: true });
}

const timestamp = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');
const CURRENT_RUN_LOG_DIR = path.join(logsRoot, timestamp);
fs.mkdirSync(CURRENT_RUN_LOG_DIR, { recursive: true });

// Make the current run log directory available to the agent
process.env.CURRENT_RUN_LOG_DIR = CURRENT_RUN_LOG_DIR;

console.clear();
banner();
log.success(`📄 Logs → ${CURRENT_RUN_LOG_DIR}`);
log.success('🚀 MUD-AI v0.6.5 — 4-Stage Thinking System (context-engine)');

const agent = new MUDAgent();
const mud = new MUDClient();

let autoMode = true;
let loggedIn = false;
let debugMode = false;

let fullBuffer = '';
let currentLine = '';
let lastLineTime = Date.now();
let lastActivity = Date.now();

let ultraShortMemories: string[] = [];
let recentMemories: string[] = [];
let persistentMemories: string[] = [];

// ==================== MEMORY ====================
async function loadPersistentMemories() {
  try {
    const memories = await getRecentMemories(30);
    persistentMemories = memories
      .map(m => m.content)
      .filter((c): c is string => !!c);

    if (persistentMemories.length === 0) {
      persistentMemories = [
        "I am a player in Achaea",
        "Primary goal: Survive, explore, and complete my current quest",
        "I must stay aware of my location, health, and threats"
      ];
    }
    log.success(`📦 Loaded ${persistentMemories.length} persistent memories`);
  } catch (e: any) {
    log.error('Failed to load persistent memories:', e.message);
    persistentMemories = [
      "I am a player in Achaea",
      "Primary goal: Survive, explore, and complete my current quest"
    ];
  }
}

async function memorize(text: string, importance: number = 0.75) {
  try {
    await storeMemory(text, importance, []);
  } catch (e: any) {
    log.error('Failed to store memory:', e.message);
  }
}

// ==================== START / CONNECT ====================
async function start() {
  await memorize("System: Follow the exact 4-stage thinking system.", 0.9);
  await loadPersistentMemories();
  loggedIn = true;
  mud.connect();
  log.success('✅ Connected — 4-stage autopilot active');
}

// ==================== GAME DATA HANDLER ====================
mud.on('data', (data: string) => {
  if (!autoMode || !loggedIn) return;
  lastActivity = Date.now();

  data.split('\n').forEach(line => {
    const t = line.trim();
    if (t) {
      currentLine = t;
      fullBuffer += line + '\n';
    }
  });
});

// ==================== REACT ====================
setInterval(async () => {
  if (!autoMode || !loggedIn || !currentLine) return;
  if (Date.now() - lastLineTime < 80) return;

  if (debugMode) log.info('⚡ React()');

  const result = await agent.react(currentLine, { ultraShort: ultraShortMemories });

  if (result.immediateAction) {
    mud.sendCommand(result.immediateAction);
  } else if (result.observations) {
    for (const obs of result.observations) {
      await memorize(obs, 0.7);
      recentMemories.push(obs);
      ultraShortMemories.push(obs);
    }
  }

  currentLine = '';
  lastLineTime = Date.now();
  pruneOldMemories();
}, 90);

// ==================== THINK ====================
setInterval(async () => {
  if (!autoMode || !loggedIn) return;
  if (Date.now() - lastActivity < 1500 || !fullBuffer.trim()) return;

  if (debugMode) log.info('🧠 Think()');

  const result = await agent.think(fullBuffer.trim(), { recent: recentMemories, persistent: persistentMemories });

  if (result.action && result.current_state !== "main_menu") {
    mud.sendCommand(result.action);
  } 
  else if (result.shouldReflect && result.current_state !== "main_menu") {
    await doReflectAndDecide();
  }

  fullBuffer = '';
  pruneOldMemories();
}, 300);

async function doReflectAndDecide() {
  const queries = await agent.reflect({ recent: recentMemories, persistent: persistentMemories });
  const retrieved = await agent.queryMemories(queries);
  const decision = await agent.decide(retrieved);

  if (decision.command && loggedIn) {
    mud.sendCommand(decision.command);
  }
}

function pruneOldMemories() {
  ultraShortMemories = ultraShortMemories.slice(-15);
  recentMemories = recentMemories.slice(-80);
}

// ==================== UI HELPERS ====================
function showHelp() {
  console.log(`
╔════════════════════════════════════════════════════════════════════════════╗
║                      MUD-AI v0.6.5 — COMMANDS (context-engine)             ║
╠════════════════════════════════════════════════════════════════════════════╗
║  !help, !h     Show this help                                              ║
║  !rules        Show 4-stage thinking rules                                 ║
║  !connect      Connect to MUD                                              ║
║  !auto         Toggle autopilot                                            ║
║  !status       Show memory counts + state                                  ║
║  !memory       Dump recent memories                                        ║
║  !memorize <text>   Manually save memory                                   ║
║  !think        Manually trigger Think()                                    ║
║  !reflect      Manually trigger Reflect + Decide                           ║
║  !debug        Toggle debug mode                                           ║
║  !cls          Clear screen                                                ║
║  !quit         Exit                                                        ║
╚════════════════════════════════════════════════════════════════════════════╝
`);
}

function showRules() {
  console.log(`
REACT() → THINK() → REFLECT() → DECIDE()
- REACT: Instant reaction to new lines
- THINK: Deeper analysis after silence
- REFLECT: Query long-term memory
- DECIDE: Final command sent to MUD
`);
}

function showStatus() {
  console.log(`\n[STATUS] Auto=${autoMode} | Connected=${loggedIn} | Debug=${debugMode}`);
  console.log(`Memories → Ultra: ${ultraShortMemories.length} | Recent: ${recentMemories.length} | Persistent: ${persistentMemories.length}\n`);
}

async function showMemories() {
  const memories = await getRecentMemories(15);
  console.log('\n=== RECENT MEMORIES ===');
  memories.forEach((m, i) => {
    if (m.content) console.log(`${i + 1}. ${m.content.substring(0, 100)}`);
  });
}

// ==================== READLINE ====================
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: 'MUD-AI> '
});

rl.on('line', async (input: string) => {
  const line = input.trim();
  if (!line) { rl.prompt(); return; }

  const c = line.toLowerCase();

  if (c === '!help' || c === '!h') {
    showHelp();
  } else if (c === '!rules') {
    showRules();
  } else if (c === '!connect' || c === '!login') {
    await start();
  } else if (c === '!auto' || c === '!autopilot') {
    autoMode = !autoMode;
    log.success(`Autopilot ${autoMode ? '✅ ENABLED' : '❌ DISABLED'}`);
  } else if (c === '!status' || c === '!st') {
    showStatus();
  } else if (c === '!memory' || c === '!mem') {
    await showMemories();
  } else if (c.startsWith('!memorize ')) {
    const text = line.slice(10).trim();
    if (text) {
      await memorize(text, 0.9);
      log.success(`💾 Manually memorized: ${text}`);
    } else {
      log.info('Usage: !memorize <text>');
    }
  } else if (c === '!think') {
    if (!fullBuffer.trim()) {
      log.info('No game output in buffer yet.');
    } else {
      log.info('🧠 Manual Think() triggered...');
      const result = await agent.think(fullBuffer.trim(), { recent: recentMemories, persistent: persistentMemories });
      console.log(result);
    }
  } else if (c === '!reflect') {
    log.info('🔎 Manual Reflect + Decide triggered...');
    await doReflectAndDecide();
  } else if (c === '!debug') {
    debugMode = !debugMode;
    log.success(`Debug mode ${debugMode ? '✅ ON' : '❌ OFF'}`);
  } else if (c === '!cls' || c === '!clear') {
    console.clear();
  } else if (c === '!quit' || c === '!exit') {
    log.success('👋 Shutting down MUD-AI...');
    rl.close();
    process.exit(0);
  } else {
    if (loggedIn) {
      mud.sendCommand(line);
    } else {
      log.info('Not connected yet. Type !connect or !login first.');
    }
  }

  rl.prompt();
});

rl.on('close', () => {
  process.exit(0);
});

// ==================== BOOT ====================
showHelp();
log.success('Type !help or !connect');
rl.prompt();