// src/index.ts
process.env.OPENAI_LOG = 'none';
process.env.DEBUG = '';
import debug from 'debug';
debug.disable();

import 'dotenv/config';
import { startInteractiveCLI } from './cli.js';
import { MUDAgent } from './agent/agent.js';
import { MUDClient } from './mud-client/client.js';
import { ingestEvent } from './context-engine/ingestion.js';
import { log, banner } from './logger.js';
import { initMemoryDB, memorizeFromUser, getLoginSequence } from './memory-store.js';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

import ws from 'ws';
(global as any).WebSocket = ws;

banner();
log.success('🚀 MUD-AI v0.4 Fully Disconnected CLI Ready');
log.info('You can now run !help, !rules, !memorize completely offline');

const agent = new MUDAgent();
const mud = new MUDClient();
let autoMode = false;
let loggedIn = false;
let buffer = '';
let lastActivity = Date.now();
let currentState = 'idle';
let desiredUsername: string | null = null;
let desiredPassword: string | null = null;
let isCreatingNewCharacter = false;
let isGuestSession = false;
let hasSentInitialChoice = false;   // ← NEW: prevents looping on G/N

// Load saved credentials from .env
const SAVED_CHARACTER = process.env.MUD_CHARACTER || null;
const SAVED_PASSWORD = process.env.MUD_PASSWORD || null;

// Cool guest name generator
function generateCoolGuestName(): string {
  const prefixes = ['Quantum', 'Aether', 'Shadow', 'Nexus', 'Void', 'Echo', 'Cipher', 'Nova', 'Zephyr', 'Raven'];
  const suffixes = ['Grok', 'Xai', 'Walker', 'Drift', 'Pulse', 'Forge', 'Spark', 'Blade', 'Ghost', 'Storm'];
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  const suffix = suffixes[Math.floor(Math.random() * suffixes.length)];
  const num = Math.floor(Math.random() * 900) + 100;
  return `${prefix}${suffix}${num}`;
}

// Generate a secure random password
function generateSecurePassword(length = 14): string {
  return crypto.randomBytes(Math.ceil(length / 2))
    .toString('hex')
    .slice(0, length);
}

function saveCredentialsToEnv(character: string, password: string) {
  const envPath = path.resolve(process.cwd(), '.env');
  let content = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';

  const lines = content.split('\n').filter(Boolean);
  let hasChar = false;
  let hasPass = false;

  const newLines = lines.map(line => {
    if (line.startsWith('MUD_CHARACTER=')) {
      hasChar = true;
      return `MUD_CHARACTER=${character}`;
    }
    if (line.startsWith('MUD_PASSWORD=')) {
      hasPass = true;
      return `MUD_PASSWORD=${password}`;
    }
    return line;
  });

  if (!hasChar) newLines.push(`MUD_CHARACTER=${character}`);
  if (!hasPass) newLines.push(`MUD_PASSWORD=${password}`);

  fs.writeFileSync(envPath, newLines.join('\n') + '\n');
  log.success(`✅ Credentials saved to .env → MUD_CHARACTER=${character}`);
}

initMemoryDB();

// ────── LOCAL COMMAND FUNCTIONS ──────
async function startLoginSequence() {
  if (loggedIn) return log.info("✅ Already connected");

  if (SAVED_CHARACTER && SAVED_PASSWORD) {
    desiredUsername = SAVED_CHARACTER;
    desiredPassword = SAVED_PASSWORD;
    isCreatingNewCharacter = false;
    isGuestSession = false;
    log.success(`🔑 Logging in with saved character from .env: ${SAVED_CHARACTER}`);
  } else {
    desiredUsername = generateCoolGuestName();
    desiredPassword = generateSecurePassword();
    isCreatingNewCharacter = true;
    isGuestSession = false;
    log.success(`🆕 No saved character found. Creating new character: ${desiredUsername}`);
    log.info(`   Auto-generated secure password: ${desiredPassword}`);
    log.info(`   → Will be automatically saved to .env when you reach the game`);
  }

  hasSentInitialChoice = false;
  log.success("🔌 Connecting to Discworld...");
  await ingestEvent('Manual !login triggered', { source: 'user' });
  mud.connect();
  loggedIn = true;
  currentState = 'login_screen';
  autoMode = true;
}

async function showHelp() {
  log.info(`
📜 MUD-AI Commands (work even when disconnected):

  !login     → Login with saved character (from .env)
               OR create a new character + auto-save credentials (if none exist)
  !guest     → Temporary guest account (never saved)
  !savecreds <password> → Manually save current character to .env
  !auto      → Toggle autopilot
  !memorize "..." → Save permanent rule
  !rules     → Show all saved rules
  !help      → Show this help
  !cls / !clear → Clear the screen
  !heartbeat 8 → Set heartbeat interval (seconds)
  !exit / !quit → Exit program

Any other text is sent to the MUD once connected.
`);
}

async function showRules() {
  const rules = await getLoginSequence();

  const userRules = rules.filter(r =>
    !r.includes('→ login_screen') &&
    !r.includes('→ in_game')
  );

  const systemRules = rules.filter(r =>
    r.includes('→ login_screen') ||
    r.includes('→ in_game')
  );

  log.info(`📜 System Rules (${systemRules.length}):`);
  systemRules.forEach((r, i) => log.info(`   ${i + 1}. ${r}`));

  if (userRules.length > 0) {
    log.info(`\n📝 Your Memorized Rules (${userRules.length}):`);
    userRules.forEach((r, i) => log.info(`   ${i + 1}. ${r}`));
  } else {
    log.info(`\n📝 Your Memorized Rules: (none yet — use !memorize "your rule")`);
  }
}

// ────── MAIN LAUNCH ──────
async function launch() {
  mud.onCLICommand = async (input: string) => {
    const cmd = input.trim();

    if (cmd === '!help') return showHelp();
    if (cmd === '!rules') return showRules();

    if (cmd === '!login') {
      return startLoginSequence();
    }

    if (cmd === '!guest') {
      desiredUsername = generateCoolGuestName();
      desiredPassword = null;
      isCreatingNewCharacter = false;
      isGuestSession = true;
      hasSentInitialChoice = false;
      log.success(`🎭 Starting temporary guest session: ${desiredUsername}`);
      log.success("🔌 Connecting to Discworld...");
      await ingestEvent('Manual !guest triggered', { source: 'user' });
      mud.connect();
      loggedIn = true;
      currentState = 'login_screen';
      autoMode = true;
      return;
    }

    if (cmd.startsWith('!savecreds ')) {
      const password = cmd.slice(11).trim();
      const charToSave = desiredUsername || SAVED_CHARACTER;
      if (!charToSave) {
        return log.warn("No character to save yet. Use !login first.");
      }
      saveCredentialsToEnv(charToSave, password);
      return;
    }

    if (cmd === '!auto') {
      autoMode = !autoMode;
      return log.success(`🔄 Autopilot: ${autoMode ? 'ENABLED' : 'DISABLED'}`);
    }
    if (cmd === '!cls' || cmd === '!clear') {
      process.stdout.write('\x1B[2J\x1B[3J\x1B[H');
      return;
    }
    if (cmd === '!exit' || cmd === '!quit') {
      log.info('👋 Exiting MUD-AI...');
      process.exit(0);
    }
    if (cmd.startsWith('!memorize ')) {
      const text = cmd.slice(10).trim();
      await memorizeFromUser(text);
      return log.success(`💾 Saved: ${text}`);
    }
    if (cmd.startsWith('!heartbeat ')) {
      const sec = parseInt(cmd.slice(11)) || 5;
      return log.success(`⏰ Heartbeat set to ${sec}s`);
    }

    if (loggedIn) {
      mud.sendCommand({ action: 'send_command', command: cmd });
    } else if (!cmd.startsWith('!')) {
      log.warn("❌ Not connected yet. Type !login or !guest first.");
    }
  };

  startInteractiveCLI(agent, mud, (mode) => { autoMode = mode; });

  // Monkey-patch sendCommand safety net
  const originalSend = mud.sendCommand.bind(mud);
  mud.sendCommand = (data: any) => {
    if (typeof data === 'string' && data.trim().startsWith('!')) {
      mud.onCLICommand?.(data);
      return;
    }
    if (typeof data === 'object' && data.command && data.command.startsWith('!')) {
      mud.onCLICommand?.(data.command);
      return;
    }
    originalSend(data);
  };

  // Heartbeat - quieter on login screens
  setInterval(async () => {
    if (!autoMode || !loggedIn) return;
    if (Date.now() - lastActivity > 6000) {
      if (currentState === 'in_game') {
        log.info('⏰ [HEARTBEAT] Thinking...');
      }
      lastActivity = Date.now();
      const decision = await agent.think(`Quiet. State: ${currentState}`, { state: currentState });
      if (decision.action !== 'noop') mud.sendCommand(decision);
    }
  }, 2500);

  // Data handler
  mud.on('data', async (raw) => {
    if (!autoMode) return;

    const clean = raw.replace(/Press enter to continue ��/g, '');
    buffer += clean + '\n';
    lastActivity = Date.now();

    const t = buffer.toLowerCase();

    if (t.includes('exits:') || t.includes('pumpkin')) currentState = 'in_game';
    else if (t.includes('male or female') || t.includes('capitalised')) currentState = 'character_creation';
    else currentState = 'login_screen';

    // === IMPROVED: Handle Discworld login menu (only once) ===
    const isLoginMenu = t.includes('n - new character') && 
                        t.includes('g - guest character') &&
                        t.includes("or, enter your current character's name");

    if (isLoginMenu && currentState === 'login_screen' && !hasSentInitialChoice) {
      
      if (isGuestSession) {
        log.success(`🎭 Sending G for guest character`);
        mud.sendCommand({ action: 'send_command', command: 'G' });
        hasSentInitialChoice = true;
        buffer = '';
        return;
      }
      
      if (isCreatingNewCharacter) {
        log.success(`🆕 Sending N to create new character`);
        mud.sendCommand({ action: 'send_command', command: 'N' });
        hasSentInitialChoice = true;
        buffer = '';
        return;
      }
      
      if (desiredUsername && !isCreatingNewCharacter) {
        log.success(`✍️  Auto-sending saved name: ${desiredUsername}`);
        mud.sendCommand({ action: 'send_command', command: desiredUsername });
        hasSentInitialChoice = true;
        buffer = '';
        return;
      }
    }

    // Name prompt during creation (catch "Enter the name you wish to use:" and "Please try again:")
    const isNamePrompt =
      t.includes('enter the name you wish to use') ||
      t.includes('enter the name') ||
      t.includes('capitalised') ||
      t.includes('what is your name') ||
      t.includes('name:') ||
      t.includes('please try again') ||
      t.includes('try again');

    if (isNamePrompt && desiredUsername && currentState !== 'in_game') {
      log.success(`✍️  Auto-sending name: ${desiredUsername}`);
      mud.sendCommand({ action: 'send_command', command: desiredUsername });
      buffer = '';
      return;
    }

    // Password prompt
    const isPasswordPrompt = t.includes('password') || t.includes('enter password');

    if (isPasswordPrompt && desiredPassword && currentState !== 'in_game') {
      log.success(`🔐 Auto-sending password`);
      mud.sendCommand({ action: 'send_command', command: desiredPassword });
      buffer = '';
      return;
    }

    const needsDecision = t.includes('your choice:') || 
                         t.includes('enter the name you wish to use') ||
                         t.includes('capitalised') || t.includes('male or female') ||
                         t.includes('screenreader') || t.includes('yes if you agree') ||
                         t.includes('more') || t.includes('exits:') ||
                         t.includes('please try again');

    if (needsDecision) {
      await ingestEvent(buffer, { state: currentState });
      const decision = await agent.think(buffer, { state: currentState });
      if (decision.action !== 'noop') mud.sendCommand(decision);
      buffer = '';
    }

    // Auto-save when new character reaches the game
    if (currentState === 'in_game' && isCreatingNewCharacter && desiredUsername && desiredPassword) {
      saveCredentialsToEnv(desiredUsername, desiredPassword);
      log.success(`🎉 New character created and credentials saved to .env!`);
      isCreatingNewCharacter = false;
      desiredUsername = null;
      desiredPassword = null;
    }
  });

  log.success('✅ Everything works disconnected. Type !help to begin.');
  log.info('   How !login works now:');
  log.info('     • If MUD_CHARACTER + MUD_PASSWORD exist in .env → logs you in');
  log.info('     • If they are empty → creates a new character + auto-saves to .env');
}

launch().catch(e => log.error(e));