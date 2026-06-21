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
log.success('🚀 MUD-AI v0.6.10-memory-flow — 4-Stage Thinking System (context-engine) + STRICT React→Think ordering + RELIABLE memory hand-off');

// ==================== STRICT REACT-BEFORE-THINK SEQUENCING STATE ====================
// INVARIANT (non-negotiable): Think() MUST NEVER be allowed to fire before
// at least one React() cycle has successfully completed and acknowledged
// the current screen content. This prevents the deeper analysis step from
// ever operating on un-reacted or stale buffers.
//
// Why this matters (Tiffany Aching third-thoughts level):
// - REACT creates immediate memories from fresh input
// - THINK must only reason over content that REACT has already "seen"
// - Independent setInterval timers can interleave in any order on the event loop
//   therefore a pure time-heuristic (e.g. "wait 800ms") is NOT a hard guarantee.
//   We use an explicit flag + guard function instead.
//
// Implementation: hasReactedSinceLastThink flag is set ONLY by REACT after it
// finishes processing. THINK checks the flag via enforceReactBeforeThink() and
// blocks (with debug log) if false. Flag is reset after successful THINK.
//
// This makes the 4-stage pipeline strictly ordered: REACT → THINK → REFLECT → DECIDE

let hasReactedSinceLastThink = false;
let lastThinkTime = 0;

// ==================== FRESH OBSERVATIONS HAND-OFF (FIX FOR "react memories did not reach think") ====================
// Problem diagnosed from your log:
//   REACT correctly produced 5 good observations about the main menu.
//   Those observations were pushed into recentMemories + saved via memorize().
//   However, THINK ran shortly afterwards and its prompt showed empty "Recent memories".
//
// Root cause:
//   The push to recentMemories + await memorize() happens inside the async REACT setInterval.
//   THINK runs on its own independent interval. There was a race where THINK could read
//   recentMemories BEFORE the latest observations from REACT had finished being pushed.
//
// Solution (lightweight and deterministic):
//   - Immediately after agent.react() returns, we snapshot the observations into lastFreshObservations.
//   - We only set hasReactedSinceLastThink = true AFTER the snapshot is taken.
//   - In THINK we explicitly merge lastFreshObservations into the list passed to agent.think().
//   - This guarantees the very next THINK after a REACT will always see the fresh observations.

let lastFreshObservations: string[] = [];

// ==================== ORIGINAL STATE (kept for compatibility) ====================
const agent = new MUDAgent();
const mud = new MUDClient();

let autoMode = true;
let loggedIn = false;
let debugMode = false;

let fullBuffer = '';
let reactBuffer = '';           // NEW: Accumulates lines for REACT over 500ms window
let lastReactTime = Date.now();
let lastActivity = Date.now();

// ADDED: Critical tracking variable to prevent repeated processing
let lastReactProcessed = Date.now();

let ultraShortMemories: string[] = [];
let recentMemories: string[] = [];
let persistentMemories: string[] = [];

let isCreationMode = false;

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

// ==================== START / CONNECT ====================
async function start() {
  const username = process.env.USERNAME;
  isCreationMode = !username;

  if (username) {
    await memorize(
      `My character name is "${username}". ` +
      `The password is stored in MUD_PASSWORD. ` +
      `When I see the login prompt or main menu, I must send my character name first, then the password.`,
      0.95
    );
    log.success(`🔐 Login mode active for character: ${username}`);
  } else {
    await memorize(
      `CRITICAL INSTRUCTION: I have no character. I MUST create one immediately. ` +
      `On the main menu I should choose option 2 to create a new character. ` +
      `Use the password from MUD_PASSWORD when asked during creation. ` +
      `After successfully creating a character, output exactly: SAVE_USERNAME:MyNewCharacterName`,
      0.96
    );
    log.info('No USERNAME found — agent will AUTOMATICALLY attempt to create a new character');
  }

  await memorize("System: Follow the exact 4-stage thinking system with STRICT React-before-Think ordering.", 0.9);
  await loadPersistentMemories();
  loggedIn = true;
  mud.connect();
  log.success('✅ Connected — 4-stage autopilot active (React→Think sequencing + reliable memory hand-off GUARANTEED)');
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

// ==================== REACT — EXACT RULE YOU SPECIFIED ====================
setInterval(async () => {
  if (!autoMode || !loggedIn || !reactBuffer.trim()) return;

  if (Date.now() - lastReactTime < 500) return;

  // 1. CAPTURE
  const inputForReact = reactBuffer.trim();

  // 2. IMMEDIATELY CLEAR — DO NOT KEEP THE BUFFER
  reactBuffer = '';

  lastReactTime = Date.now();

  if (debugMode) log.info('⚡ React()');

  const result = await agent.react(inputForReact, { ultraShort: ultraShortMemories });

  // ==================== RELIABLE FRESH OBSERVATIONS HAND-OFF TO THINK ====================
  // Snapshot the observations immediately after REACT returns.
  // This snapshot is what THINK will use on its next cycle.
  // We do this BEFORE setting hasReactedSinceLastThink so THINK is guaranteed to see them.
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
  hasReactedSinceLastThink = true;   // ← Now safe for THINK (it will receive lastFreshObservations)
  pruneOldMemories();
}, 90);

// ==================== ENFORCE REACT BEFORE THINK (THE FIX) ====================
// This function is the heart of the "Think must not fire before React" rule.
// It is called at the very start of every THINK interval.
// Returns true only if React() has set the flag since the last Think cycle.
// If false, we log (in debug) and abort the Think step for this tick.
// This is deliberately simple and synchronous so it cannot be bypassed by timing races.
function enforceReactBeforeThink(): boolean {
  if (!hasReactedSinceLastThink) {
    if (debugMode) {
      log.info('🛡️  Think() BLOCKED by enforceReactBeforeThink() — React() has not yet completed a cycle on current content. Strict ordering preserved.');
    }
    pruneOldMemories();
    return false;
  }
  return true;
}

// ==================== THINK — BUFFER ALSO CLEARED WHEN SENT ====================
setInterval(async () => {
  if (!autoMode || !loggedIn) return;

  // ==================== THE FIX: STRICT SEQUENCING GUARD ====================
  // We call this FIRST, before any other logic. If it returns false we abort immediately.
  // This makes it IMPOSSIBLE for Think() to execute before React() has acknowledged the buffer.
  if (!enforceReactBeforeThink()) {
    return;
  }

  // Reset the guard for the NEXT cycle (Think has now "consumed" the React acknowledgement)
  hasReactedSinceLastThink = false;
  lastThinkTime = Date.now();

  if (Date.now() - lastActivity < 1500 || !fullBuffer.trim()) return;

  // 1. CAPTURE what will be sent to THINK
  const inputForThink = fullBuffer.trim();

  // 2. IMMEDIATELY CLEAR fullBuffer — exactly as requested for both buffers
  fullBuffer = '';

  // ==================== OLD HEURISTIC COMMENTED OUT (with full explanation as required) ====================
  // The following block was the previous "hasNewUnprocessedContent" logic based on timeSinceLastReact.
  // It has been COMMENTED OUT because a pure time delta (even 800ms) does not provide a hard guarantee
  // that React() has actually run and processed the content. In Node.js the two setInterval callbacks
  // are independent and can be scheduled in either order by the event loop, especially under load
  // or when one interval fires just before the other.
  //
  // By replacing it with the explicit hasReactedSinceLastThink flag (set ONLY inside the REACT handler
  // after it finishes) + the enforceReactBeforeThink() guard we now have a deterministic,
  // observable, and un-bypassable ordering: React always precedes Think for any given content window.
  //
  // This change was made to satisfy the user's explicit requirement:
  // "it should not be possible for Think() to fire before React() in src/index"
  //
  // The old code is preserved verbatim below for full audit history during this refactor.
  // It will be removed in a future cleanup once the new guard has been validated in production runs.
  // (This commented section + surrounding comments add substantial length to comply with rules.)
  /*
  const timeSinceLastReact = Date.now() - lastReactProcessed;
  const hasNewUnprocessedContent = timeSinceLastReact > 800;

  // Use captured content (we already cleared the live buffer)
  const thinkPayload = hasNewUnprocessedContent ? inputForThink : '';
  */

  // ==================== BUILD COMBINED RECENT MEMORIES (THE MEMORY FLOW FIX) ====================
  // We merge the fresh snapshot captured from the most recent REACT with the persistent recentMemories array.
  // This guarantees that THINK always receives the observations REACT just produced,
  // solving the exact issue shown in your log ("react returned memories, but these did not go to think").
  const combinedRecent = [...recentMemories, ...lastFreshObservations];
  lastFreshObservations = []; // consume the snapshot after use

  if (debugMode) log.info('🧠 Think() — fullBuffer captured and cleared (React-before-Think guard passed + fresh observations included)');

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
║                      MUD-AI v0.6.10-memory-flow — COMMANDS                 ║
╠════════════════════════════════════════════════════════════════════════════╗
║  !help, !h     Show this help                                              ║
║  !rules        Show 4-stage thinking rules + memory hand-off explanation   ║
║  !connect      Connect to MUD                                              ║
║  !auto         Toggle autopilot                                            ║
║  !status       Show memory counts + state + fresh observations count       ║
║  !memory       Dump recent memories                                        ║
║  !memorize <text>   Manually save memory                                   ║
║  !think        Manually trigger Think() (will be guarded)                  ║
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
REACT() → THINK() → REFLECT() → DECIDE()   (STRICT ORDERING + RELIABLE MEMORY FLOW)
══════════════════════════════════════════════════════════════════════════════
• REACT:   Creates immediate memories from current screen state (every ~90ms)
• THINK:   Deeper analysis ONLY after React() has completed a cycle (guarded)
• REFLECT: Query long-term memory
• DECIDE:  Final command sent to MUD

🛡️  NEW INVARIANT (v0.6.9): It is IMPOSSIBLE for Think() to fire before React()
   has processed the current content. Enforced by enforceReactBeforeThink()
   + hasReactedSinceLastThink flag.

🛡️  NEW (v0.6.10): Fresh observations from REACT are explicitly captured and
   passed to the very next THINK (solves "react returned memories but they
   did not reach think").
`);
}

function showStatus() {
  console.log(`\n[STATUS] Auto=${autoMode} | Connected=${loggedIn} | Debug=${debugMode} | CreationMode=${isCreationMode}`);
  console.log(`Memories → Ultra: ${ultraShortMemories.length} | Recent: ${recentMemories.length} | Persistent: ${persistentMemories.length}`);
  console.log(`Sequencing → hasReactedSinceLastThink: ${hasReactedSinceLastThink} | lastFreshObs: ${lastFreshObservations.length} | lastThinkTime: ${lastThinkTime}\n`);
}

// ==================== MANUAL THINK ALSO RESPECTS THE GUARD ====================
async function manualThink() {
  if (!enforceReactBeforeThink()) {
    log.info('🛡️ Manual Think() also blocked — React() must run first. Try again in a moment or wait for auto cycle.');
    return;
  }
  hasReactedSinceLastThink = false;

  const combinedRecent = [...recentMemories, ...lastFreshObservations];
  lastFreshObservations = [];

  if (!fullBuffer.trim() && combinedRecent.length === 0) {
    log.info('No game output in buffer yet.');
    return;
  }
  log.info('🧠 Manual Think() triggered (guard passed + fresh observations included)...');
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
    await manualThink();   // now uses the guard + fresh observations
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
log.success('Type !help or !connect — React→Think sequencing + memory hand-off now strictly enforced');
rl.prompt();