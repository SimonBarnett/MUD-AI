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
log.success('🚀 MUD-AI v0.6.11-login-creation — 4-Stage Thinking System + STRICT React→Think + RELIABLE memory hand-off + Cool Temp Name Creation');

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

let fullBuffer = '';
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

  // Occasionally add a cool compound feel
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

// ==================== USERNAME PERSISTENCE ====================
function saveUsernameToEnv(username: string) {
  const envPath = path.join(process.cwd(), '.env');

  try {
    let envContent = fs.existsSync(envPath)
      ? fs.readFileSync(envPath, 'utf8')
      : '';

    envContent = envContent.replace(/^USERNAME=.*$/m, '').trim();
    envContent += `\nUSERNAME=${username}\n`;

    fs.writeFileSync(envPath, envContent);
    process.env.USERNAME = username;

    log.success(`💾 Username saved to .env → USERNAME=${username}`);
  } catch (e: any) {
    log.error('Failed to save username to .env:', e.message);
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

// ==================== START / CONNECT (UPDATED WITH NEW LOGIC) ====================
async function start() {
  const envUsername = process.env.USERNAME;
  isCreationMode = !envUsername;

  if (envUsername) {
    // ==================== LOGIN MODE ====================
    await memorize(
      `My character name is "${envUsername}". ` +
      `The password is stored in MUD_PASSWORD. ` +
      `When I see the login prompt or main menu, I must send my character name first, then the password.`,
      0.95
    );
    log.success(`🔐 Login mode active for character: ${envUsername}`);
  } else {
    // ==================== CREATION MODE ====================
    const tempName = generateCoolTempName();

    await memorize(
      `I am using the temporary name "${tempName}". ` +
      `The password is stored in MUD_PASSWORD. ` +
      `My primary mission is to create a new character. ` +
      `On the main menu I should choose option 2 (Create a new character). ` +
      `After I successfully create the character, I must output exactly: SAVE_USERNAME:${tempName}`,
      0.96
    );

    log.info(`🆕 Creation mode active — temporary name generated: ${tempName}`);
    log.info('Agent will attempt to create a new character and then save the name to .env');
  }

  await memorize("System: Follow the exact 4-stage thinking system with STRICT React-before-Think ordering.", 0.9);
  await loadPersistentMemories();
  loggedIn = true;
  mud.connect();
  log.success('✅ Connected — 4-stage autopilot active (React→Think + Login/Creation modes)');
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
      fullBuffer += line + '\n';
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

// ==================== THINK ====================
setInterval(async () => {
  if (!autoMode || !loggedIn) return;

  if (!enforceReactBeforeThink()) {
    return;
  }

  hasReactedSinceLastThink = false;
  lastThinkTime = Date.now();

  if (Date.now() - lastActivity < 1500 || !fullBuffer.trim()) return;

  const inputForThink = fullBuffer.trim();
  fullBuffer = '';

  const combinedRecent = [...recentMemories, ...lastFreshObservations];
  lastFreshObservations = [];

  if (debugMode) log.info('🧠 Think() — fresh observations included');

  const result = await agent.think(inputForThink, { recent: combinedRecent, persistent: persistentMemories });

  if (isCreationMode && result.current_state === "main_menu") {
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
║                      MUD-AI v0.6.11-login-creation — COMMANDS              ║
╠════════════════════════════════════════════════════════════════════════════╗
║  !help, !h     Show this help                                              ║
║  !rules        Show current rules (Login vs Creation modes)                ║
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
• Login vs Creation mode is decided **only** by presence of USERNAME in .env
• Cool temporary name (no numbers) is generated automatically in creation mode
• Always use password from MUD_PASSWORD
• Two different core imperatives are set at boot depending on the mode
`);
}

function showStatus() {
  console.log(`\n[STATUS] Auto=${autoMode} | Connected=${loggedIn} | Debug=${debugMode} | CreationMode=${isCreationMode}`);
  console.log(`Memories → Ultra: ${ultraShortMemories.length} | Recent: ${recentMemories.length} | Persistent: ${persistentMemories.length}`);
  console.log(`Sequencing → hasReactedSinceLastThink: ${hasReactedSinceLastThink} | lastFreshObs: ${lastFreshObservations.length}\n`);
}

async function manualThink() {
  if (!enforceReactBeforeThink()) {
    log.info('🛡️ Manual Think() blocked — React() must run first.');
    return;
  }
  hasReactedSinceLastThink = false;

  const combinedRecent = [...recentMemories, ...lastFreshObservations];
  lastFreshObservations = [];

  if (!fullBuffer.trim() && combinedRecent.length === 0) {
    log.info('No content available for manual Think.');
    return;
  }

  log.info('🧠 Manual Think() triggered...');
  const result = await agent.think(fullBuffer.trim() || '', { recent: combinedRecent, persistent: persistentMemories });
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
log.success('Type !help or !connect — Login vs Creation mode now active with cool temp names');
rl.prompt();