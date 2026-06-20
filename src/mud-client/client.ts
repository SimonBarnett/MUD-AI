// src/index.ts - FULL UNABRIDGED ACHaea VERSION (persistent name + no loops)
process.env.OPENAI_LOG = 'none';
process.env.DEBUG = '';
import debug from 'debug';
debug.disable();

import 'dotenv/config';
import { startInteractiveCLI } from '../cli.js';
import { MUDAgent } from '../agent/agent.js';
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
log.success('🚀 MUD-AI v0.4 — ACHaea Edition (name is now locked in memory)');

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
let hasSentInitialChoice = false;
let hasChosenCreation = false;

// Load env
const SAVED_CHARACTER = process.env.MUD_CHARACTER || null;
const SAVED_PASSWORD = process.env.MUD_PASSWORD || null;

function generateAchaeaName(): string {
  const prefixes = ['Kai', 'Zor', 'Thal', 'Vex', 'Lira', 'Syl', 'Drak', 'Nyx', 'Ryn', 'Ely', 'Tor', 'Mira'];
  const suffixes = ['ar', 'eth', 'or', 'is', 'en', 'ith', 'os', 'ara', 'yn', 'iel', 'thas'];
  return prefixes[Math.floor(Math.random() * prefixes.length)] + 
         suffixes[Math.floor(Math.random() * suffixes.length)] + 
         Math.floor(Math.random() * 90 + 10); // always ≤12 chars
}

function saveCredentialsToEnv(character: string, password: string) {
  const envPath = path.resolve(process.cwd(), '.env');
  let content = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  const lines = content.split('\n').filter(Boolean);
  const newLines = lines.map(l => {
    if (l.startsWith('MUD_CHARACTER=')) return `MUD_CHARACTER=${character}`;
    if (l.startsWith('MUD_PASSWORD=')) return `MUD_PASSWORD=${password}`;
    return l;
  });
  if (!lines.some(l => l.startsWith('MUD_CHARACTER='))) newLines.push(`MUD_CHARACTER=${character}`);
  if (!lines.some(l => l.startsWith('MUD_PASSWORD='))) newLines.push(`MUD_PASSWORD=${password}`);
  fs.writeFileSync(envPath, newLines.join('\n') + '\n');
  log.success(`✅ Credentials saved → ${character}`);
}

initMemoryDB();

async function startLoginSequence(isGuest = false) {
  if (loggedIn) return log.info("✅ Already connected");

  isGuestSession = isGuest;
  hasSentInitialChoice = false;
  hasChosenCreation = false;

  desiredUsername = isGuest ? `Guest${Math.floor(Math.random()*9999)}` : generateAchaeaName();
  desiredPassword = isGuest ? null : generateSecurePassword();

  isCreatingNewCharacter = !isGuest;

  // === PERSISTENT MEMORY LOCK ===
  await memorizeFromUser(
    `PERMANENT SESSION RULE: The character name for this run is EXACTLY "${desiredUsername}". ` +
    `Whenever the MUD asks for a name, reply with ONLY that exact string. Do not invent any other name.`
  );
  log.success(`💾 LOCKED name into permanent memory: ${desiredUsername}`);

  log.success(`🔌 ${isGuest ? 'Guest' : 'New character'} → ${desiredUsername}`);
  await ingestEvent(isGuest ? 'Manual !guest' : 'Manual !login', { source: 'user' });
  mud.connect();
  loggedIn = true;
  currentState = 'login_screen';
  autoMode = true;
}

function generateSecurePassword(length = 14): string {
  return crypto.randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length);
}

async function showHelp() { /* unchanged, you can keep your old one */ log.info('!guest | !login | !savecreds <pass> | !auto | !help'); }

async function launch() {
  mud.onCLICommand = async (input: string) => {
    const cmd = input.trim();
    if (cmd === '!help') return showHelp();
    if (cmd === '!guest') return startLoginSequence(true);
    if (cmd === '!login') return startLoginSequence(false);
    if (cmd.startsWith('!savecreds ')) {
      const pass = cmd.slice(11).trim();
      if (desiredUsername) saveCredentialsToEnv(desiredUsername, pass);
      return;
    }
    if (cmd === '!auto') { autoMode = !autoMode; log.success(`Autopilot ${autoMode ? 'ON' : 'OFF'}`); return; }
    if (cmd === '!cls') { process.stdout.write('\x1B[2J\x1B[3J\x1B[H'); return; }
    if (cmd === '!exit') process.exit(0);

    if (loggedIn) mud.sendCommand({ action: 'send_command', command: cmd });
  };

  startInteractiveCLI(agent, mud, (mode) => { autoMode = mode; });

  mud.on('data', async (raw) => {
    if (!autoMode) return;
    const clean = raw.replace(/Press enter to continue ��/g, '');
    buffer += clean + '\n';
    lastActivity = Date.now();
    const t = buffer.toLowerCase();

    if (t.includes('health') || t.includes('exits') || t.includes('you are')) currentState = 'in_game';

    // === ACHaea MENU - send 2 only once ===
    if (t.includes('1. enter the game') && t.includes('2. create a new character') && !hasChosenCreation) {
      log.success('🆕 Sending 2 → Create new character (once)');
      mud.sendCommand({ action: 'send_command', command: '2' });
      hasChosenCreation = true;
      buffer = '';
      return;
    }

    // === NAME PROMPT - highest priority ===
    if ((t.includes('what is the name you wish to use') || t.includes('pick your name with care') || t.includes('your name must have between')) && desiredUsername) {
      log.success(`✍️ FORCING name (from memory): ${desiredUsername}`);
      mud.sendCommand({ action: 'send_command', command: desiredUsername });
      buffer = '';
      return;
    }

    // Let agent handle everything else
    if (t.includes('your choice') || t.includes('enter an option') || t.includes('password') || t.includes('confirm')) {
      await ingestEvent(buffer, { state: currentState });
      const decision = await agent.think(buffer, { 
        state: currentState, 
        forcedName: desiredUsername,
        rule: `You MUST use exactly "${desiredUsername}" if the MUD asks for a name.`
      });
      if (decision.action !== 'noop') mud.sendCommand(decision);
      buffer = '';
    }

    if (currentState === 'in_game' && isCreatingNewCharacter && desiredUsername && desiredPassword) {
      saveCredentialsToEnv(desiredUsername, desiredPassword);
      log.success(`🎉 Character created + credentials saved!`);
      isCreatingNewCharacter = false;
    }
  });

  log.success('✅ Full version loaded. Type !guest');
}

launch().catch(e => log.error(e));