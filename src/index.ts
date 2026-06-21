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

process.env.CURRENT_RUN_LOG_DIR = CURRENT_RUN_LOG_DIR;

console.clear();
banner();
log.success(`📄 Logs → ${CURRENT_RUN_LOG_DIR}`);
log.success('🚀 MUD-AI v0.6.21-buffer-fix — 4-Stage Thinking System + STRICT React→Think + RELIABLE memory hand-off + Cool Temp Name Creation + Login Failure Recovery');

// ==================== STRICT REACT-BEFORE-THINK SEQUENCING STATE ====================
let hasReactedSinceLastThink = false;
let lastThinkTime = 0;

// ==================== FRESH OBSERVATIONS HAND-OFF ====================
let lastFreshObservations: string[] = [];

// ==================== ORIGINAL STATE ====================
const agent = new MUDAgent();
const mud = new MUDClient();

let autoMode = true;
let loggedIn = false;
let debugMode = false;

let reactBuffer = '';
let lastReactTime = Date.now();
let lastActivity = Date.now();

let lastReactProcessed = Date.now();

let ultraShortMemories: string[] = [];
let recentMemories: string[] = [];
let persistentMemories: string[] = [];

let isCreationMode = false;

// ==================== COOL TEMP NAME GENERATOR (no numbers) ====================
function generateCoolTempName(): string {
  const prefixes = [
    "shadow", "iron", "storm", "night", "void", "ember", "frost", "rune",
    "ash", "thorn", "dusk", "blaze", "raven", "wolf", "stone", "grim"
  ];
  const suffixes = [
    "veil", "root", "whisper", "forge", "fang", "ward", "spire", "claw",
    "heart", "soul", "blade", "wraith", "crown", "shadow", "flame", "thorn"
  ];

  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  const suffix = suffixes[Math.floor(Math.random() * suffixes.length)];

  if (Math.random() > 0.6) {
    return prefix + suffix;
  } else {
    return prefix + suffix.charAt(0).toUpperCase() + suffix.slice(1);
  }
}

// ==================== ANSI STRIPPER ====================
function stripAnsi(str: string): string {
  return str.replace(
    /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-ntqry=><~]/g,
    ''
  );
}

// ==================== USERNAME PERSISTENCE (now uses MUD_CHARACTER) ====================
function saveUsernameToEnv(username: string) {
  const envPath = path.join(process.cwd(), '.env');

  try {
    let envContent = fs.existsSync(envPath)
      ? fs.readFileSync(envPath, 'utf8')
      : '';

    envContent = envContent.replace(/^MUD_CHARACTER=.*$/m, '').trim();
    envContent += `\nMUD_CHARACTER=${username}\n`;

    fs.writeFileSync(envPath, envContent);
    process.env.MUD_CHARACTER = username;

    log.success(`💾 Character saved to .env → MUD_CHARACTER=${username}`);
  } catch (e: any) {
    log.error('Failed to save character to .env:', e.message);
  }
}

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
  const mudCharacter = process.env.MUD_CHARACTER?.trim();
  const actualPassword = process.env.MUD_PASSWORD || '';

  isCreationMode = !mudCharacter;

  // Clear so the new imperative is dominant from the very first THINK
  persistentMemories = [];

  if (mudCharacter) {
    // ==================== LOGIN MODE ====================
    const imperative = 
      `I'm logging on with username ${mudCharacter} and password ${actualPassword}. ` +
      `When I see the main menu or login prompt, I must send my character name first, then the password.`;

    await memorize(imperative, 0.98);
    persistentMemories.unshift(imperative);

    log.success(`🔐 Login mode active for character: ${mudCharacter}`);
  } else {
    // ==================== CREATION MODE ====================
    const tempName = generateCoolTempName();

    const imperative = 
      `I'm creating a char, with username ${tempName} and password ${actualPassword}. ` +
      `On the main menu I must choose option 2 (Create a new character). ` +
      `When asked for password and confirm password, send the exact same value. ` +
      `After I successfully create the character, I must output exactly: SAVE_USERNAME:${tempName}`;

    await memorize(imperative, 0.99);
    persistentMemories.unshift(imperative);

    log.info(`🆕 Creation mode active — temporary name generated: ${tempName}`);
  }

  await memorize("System: Follow the exact 4-stage thinking system with STRICT React-before-Think ordering.", 0.9);
  await loadPersistentMemories();
  loggedIn = true;
  mud.connect();
  log.success('✅ Connected — Strong imperative memory active from first THINK');
}

// ==================== GAME DATA HANDLER ====================
mud.on('data', (data: string) => {
  if (!autoMode || !loggedIn) return;
  lastActivity = Date.now();

  const cleanData = stripAnsi(data);

  cleanData.split('\n').forEach(line => {
    const t = line.trim();
    if (t) {
      reactBuffer += line + '\n';
    }
  });
});

// ==================== REACT ====================
setInterval(async () => {
  if (!autoMode || !loggedIn || !reactBuffer.trim()) return;

  if (Date.now() - lastReactTime < 500) return;

  const inputForReact = reactBuffer.trim();
  reactBuffer = '';
  lastReactTime = Date.now();

  if (debugMode) log.info('⚡ React()');

  const result = await agent.react(inputForReact, { ultraShort: ultraShortMemories });

  if (result.observations && result.observations.length > 0) {
    lastFreshObservations = [...result.observations];
  } else {
    lastFreshObservations = [];
  }

  if (result.immediateAction) {
    mud.sendCommand(result.immediateAction);
  } else if (result.observations && result.observations.length > 0) {
    for (const obs of result.observations) {
      await memorize(obs, 0.7);
      recentMemories.push(obs);
      ultraShortMemories.push(obs);
    }
  }

  lastReactProcessed = Date.now();
  hasReactedSinceLastThink = true;
  pruneOldMemories();
}, 90);

// ==================== ENFORCE REACT BEFORE THINK ====================
function enforceReactBeforeThink(): boolean {
  if (!hasReactedSinceLastThink) {
    if (debugMode) {
      log.info('🛡️  Think() BLOCKED — waiting for React() to complete first.');
    }
    pruneOldMemories();
    return false;
  }
  return true;
}

// ==================== THINK (ONLY RECEIVES MEMORIES — NO RAW BUFFER) ====================
setInterval(async () => {
  if (!autoMode || !loggedIn) return;

  if (!enforceReactBeforeThink()) {
    return;
  }

  hasReactedSinceLastThink = false;
  lastThinkTime = Date.now();

  if (Date.now() - lastActivity < 1500) return;

  const combinedRecent = [...recentMemories, ...lastFreshObservations];
  lastFreshObservations = [];

  if (debugMode) log.info('🧠 Think() — using only REACT memories (no raw buffer)');

  const result = await agent.think("", { recent: combinedRecent, persistent: persistentMemories });

  const isStuckInLoginLoop = typeof (agent as any).isStuckInLoginLoop === 'function'
    ? (agent as any).isStuckInLoginLoop()
    : false;

  if (isStuckInLoginLoop && result.action) {
    if (debugMode) {
      log.info('🛡️ Login loop detected — forcing reflection instead of repeating failed action');
    }
    await doReflectAndDecide();
  } 
  else if (isCreationMode && result.current_state === "main_menu") {
    if (result.action) {
      mud.sendCommand(result.action);
    } else {
      await doReflectAndDecide();
    }
  } 
  else if (result.action && result.current_state !== "main_menu") {
    mud.sendCommand(result.action);
  } 
  else if (result.shouldReflect && result.current_state !== "main_menu") {
    await doReflectAndDecide();
  }

  pruneOldMemories();
}, 300);

async function doReflectAndDecide() {
  const queries = await agent.reflect({ recent: recentMemories, persistent: persistentMemories });
  const retrieved = await agent.queryMemories(queries);
  const decision = await agent.decide(retrieved);

  if (!decision.command || !loggedIn) return;

  if (decision.command.startsWith('SAVE_USERNAME:')) {
    const newUsername = decision.command.split(':')[1]?.trim();
    if (newUsername) {
      saveUsernameToEnv(newUsername);
      await memorize(`New character created successfully. My name is now ${newUsername}.`, 0.95);
    }
    return;
  }

  mud.sendCommand(decision.command);
}

function pruneOldMemories() {
  ultraShortMemories = ultraShortMemories.slice(-15);
  recentMemories = recentMemories.slice(-80);
}

// ==================== UI HELPERS ====================
function showHelp() {
  console.log(`
╔════════════════════════════════════════════════════════════════════════════╗
║                      MUD-AI v0.6.21-buffer-fix — COMMANDS                  ║
╠════════════════════════════════════════════════════════════════════════════╗
║  !help, !h     Show this help                                              ║
║  !rules        Show current rules                                          ║
║  !connect      Connect to MUD                                              ║
║  !auto         Toggle autopilot                                            ║
║  !status       Show memory counts + mode + sequencing state                ║
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
══════════════════════════════════════════════════════════════════════════════
REACT() → THINK() → REFLECT() → DECIDE()
══════════════════════════════════════════════════════════════════════════════
• Uses MUD_CHARACTER from .env (blank = Creation Mode, value = Login Mode)
• Actual MUD_PASSWORD value is now embedded in the startup imperative memory
• THINK receives only REACT memories (no raw buffer)
`);
}

function showStatus() {
  const isStuck = typeof (agent as any).isStuckInLoginLoop === 'function' 
    ? (agent as any).isStuckInLoginLoop() 
    : false;

  console.log(`\n[STATUS] Auto=${autoMode} | Connected=${loggedIn} | Debug=${debugMode} | CreationMode=${isCreationMode} | StuckInLoginLoop=${isStuck}`);
  console.log(`Memories → Ultra: ${ultraShortMemories.length} | Recent: ${recentMemories.length} | Persistent: ${persistentMemories.length}\n`);
}

async function manualThink() {
  if (!enforceReactBeforeThink()) {
    log.info('🛡️ Manual Think() blocked — React() must run first.');
    return;
  }
  hasReactedSinceLastThink = false;

  const combinedRecent = [...recentMemories, ...lastFreshObservations];
  lastFreshObservations = [];

  log.info('🧠 Manual Think() triggered (memories only)...');
  const result = await agent.think("", { recent: combinedRecent, persistent: persistentMemories });
  console.log(result);
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
    await manualThink();
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
log.success('Type !help or !connect — Actual MUD_PASSWORD value is now in the startup memory');
rl.prompt();