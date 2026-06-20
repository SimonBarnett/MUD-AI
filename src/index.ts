// src/index.ts - v0.5.2 — Better Observability (dated log folders + Grok debugging)
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
import { initMemoryDB, memorizeFromUser } from './memory-store.js';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

import ws from 'ws';
(global as any).WebSocket = ws;

// =====================================================
// RUNTIME LOG DIRECTORY SETUP
// =====================================================
const runtimeTimestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const logDir = path.resolve(process.cwd(), 'logs', runtimeTimestamp);

if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const runtimeLogPath = path.join(logDir, 'runtime.log');
const grokDebugPath = path.join(logDir, 'grok-debug.log');

function writeRuntimeLog(message: string) {
  const timestamp = new Date().toISOString();
  fs.appendFileSync(runtimeLogPath, `[${timestamp}] ${message}\n`);
}

function writeGrokDebug(prompt: string, response: any) {
  const timestamp = new Date().toISOString();
  const entry = {
    timestamp,
    prompt,
    response
  };
  fs.appendFileSync(grokDebugPath, JSON.stringify(entry, null, 2) + '\n\n');
}

// =====================================================
// MAIN APPLICATION
// =====================================================

banner();
log.success(`🚀 MUD-AI v0.5.2 — Observability Enabled`);
log.success(`📁 Logging to: ${logDir}`);
writeRuntimeLog('Application started');

const agent = new MUDAgent();
const mud = new MUDClient();
let autoMode = true;
let loggedIn = false;
let buffer = '';
let lastActivity = Date.now();
let currentState = 'menu';
let isCreationMode = true;
let desiredUsername = '';
let desiredPassword = '';

// === Recent Dialogue Buffer ===
let recentDialogue = '';
const MAX_RECENT_DIALOGUE_LENGTH = 1800;

// === Deduplication ===
const MIN_PROCESS_INTERVAL = parseInt(process.env.MIN_PROCESS_INTERVAL || '1600', 10);
let lastScreenHash = '';
let lastProcessTime = 0;

function getScreenHash(text: string): string {
  const normalized = text
    .replace(/Press enter to continue.*$/gi, '')
    .replace(/\d+ adventurers are currently in the realms\./gi, '')
    .replace(/Rapture Runtime Environment.*/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  return crypto.createHash('md5').update(normalized).digest('hex');
}

function loadOrGenerateCredentials() {
  const char = process.env.MUD_CHARACTER;
  if (char) {
    desiredUsername = char;
    desiredPassword = process.env.MUD_PASSWORD || 'default';
    isCreationMode = false;
    log.success(`📂 Login mode: ${desiredUsername}`);
  } else {
    desiredUsername = generatePureName();
    desiredPassword = generateLongPassword();
    isCreationMode = true;
    log.success(`🆕 Creation mode`);
  }
}

function generatePureName(): string {
  const p = ['Sylv', 'Thal', 'Elynd', 'Vaelor', 'Lira', 'Zorath', 'Nyxara', 'Aelric', 'Riven', 'Kaelith'];
  const s = ['ara', 'eth', 'iel', 'or', 'yn', 'ith', 'os', 'an', 'en', 'ir'];
  return p[Math.floor(Math.random() * p.length)] + s[Math.floor(Math.random() * s.length)];
}

function generateLongPassword(): string {
  return 'AchaeaStrong' + crypto.randomBytes(6).toString('hex') + '!2026';
}

function saveCredentials() {
  const envPath = path.resolve(process.cwd(), '.env');
  let content = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
  const lines = content.split('\n').filter(Boolean);
  const newLines = lines.map(l => l.startsWith('MUD_CHARACTER=') ? `MUD_CHARACTER=${desiredUsername}` : l.startsWith('MUD_PASSWORD=') ? `MUD_PASSWORD=${desiredPassword}` : l);
  if (!lines.some(l => l.startsWith('MUD_CHARACTER='))) newLines.push(`MUD_CHARACTER=${desiredUsername}`);
  if (!lines.some(l => l.startsWith('MUD_PASSWORD='))) newLines.push(`MUD_PASSWORD=${desiredPassword}`);
  fs.writeFileSync(envPath, newLines.join('\n') + '\n');
  log.success(`✅ Saved new character → ${desiredUsername}`);
}

initMemoryDB();
loadOrGenerateCredentials();

async function start() {
  await memorizeFromUser(`PERMANENT: Name="${desiredUsername}", Password="${desiredPassword}". ${isCreationMode ? 'Create new (send 2 on menu)' : 'Login (send 1 on menu)'}. If password rejected, generate new password.`);
  log.success(`🔒 Mode: ${isCreationMode ? 'CREATE' : 'LOGIN'}`);
  writeRuntimeLog(`Started session in ${isCreationMode ? 'CREATE' : 'LOGIN'} mode`);
  mud.connect();
  loggedIn = true;
}

async function launch() {
  mud.onCLICommand = async (input) => {
    const c = input.trim();
    if (c === '!login') { await start(); return; }
    if (c === '!auto') { autoMode = !autoMode; log.success(`Autopilot ${autoMode ? 'ON' : 'OFF'}`); return; }
    if (c === '!cls') { process.stdout.write('\x1B[2J\x1B[3J\x1B[H'); return; }
    if (c === '!help') { log.success('!login | !auto | !cls | !exit'); return; }
    if (c === '!exit') process.exit(0);
    if (loggedIn) mud.sendCommand({ action: 'send_command', command: c });
  };

  startInteractiveCLI(agent, mud, (m) => { autoMode = m; });

  setInterval(async () => {
    if (!autoMode || !loggedIn) return;
    if (Date.now() - lastActivity < 2200) return;

    log.info('🤔 Second thought...');
    writeRuntimeLog('Periodic thinking triggered');

    await ingestEvent(buffer, { state: currentState });

    const d = await agent.think(buffer, {
      state: currentState,
      recentDialogue: recentDialogue,
      forcedName: desiredUsername
    });

    if (d.action !== 'noop') mud.sendCommand(d);
    lastActivity = Date.now();
  }, 2200);

  mud.on('data', async (raw) => {
    if (!autoMode) return;

    const clean = raw.replace(/Press enter to continue ��/g, '');
    buffer += clean + '\n';
    lastActivity = Date.now();
    updateRecentDialogue(clean);

    const t = buffer.toLowerCase();

    // === Manual priority flows ===
    if (t.includes('1. enter the game') && t.includes('2. create a new character') && !hasChosenCreation) {
      log.success('🆕 Sending 2 → Create new character');
      mud.sendCommand({ action: 'send_command', command: '2' });
      hasChosenCreation = true;
      buffer = '';
      return;
    }

    if ((t.includes('what is the name you wish to use') || t.includes('pick your name with care')) && desiredUsername) {
      log.success(`✍️ Sending locked name: ${desiredUsername}`);
      mud.sendCommand({ action: 'send_command', command: desiredUsername });
      buffer = '';
      return;
    }

    if (t.includes('enter a new password') || t.includes('confirm your password')) {
      if (desiredPassword) {
        mud.sendCommand({ action: 'send_command', command: desiredPassword });
        buffer = '';
      }
      return;
    }

    // === Agent section with deduplication ===
    const now = Date.now();
    const currentHash = getScreenHash(buffer);

    const isAgentPrompt = t.includes('your choice') ||
      t.includes('enter an option') ||
      t.includes('what sex will you be') ||
      t.includes('gender selection');

    if (isAgentPrompt) {
      if (currentHash === lastScreenHash) return;
      if (now - lastProcessTime < MIN_PROCESS_INTERVAL) return;

      lastScreenHash = currentHash;
      lastProcessTime = now;

      await ingestEvent(buffer, { state: currentState });

      const decision = await agent.think(buffer, {
        state: currentState,
        forcedName: desiredUsername
      });

      if (decision.action !== 'noop') {
        mud.sendCommand(decision);
      }

      buffer = '';
    }

    if (t.includes('health') && t.includes('exits')) {
      currentState = 'in_game';
      if (isCreationMode && desiredUsername && desiredPassword) {
        saveCredentials();
        isCreationMode = false;
      }
    }
  });

  log.success('✅ Type !login');
}

function updateRecentDialogue(newText: string) {
  const cleaned = newText
    .replace(/Press enter to continue.*$/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return;

  recentDialogue = (recentDialogue + '\n' + cleaned).trim();

  if (recentDialogue.length > MAX_RECENT_DIALOGUE_LENGTH) {
    recentDialogue = recentDialogue.slice(-MAX_RECENT_DIALOGUE_LENGTH);
    const firstNewline = recentDialogue.indexOf('\n');
    if (firstNewline > 50) {
      recentDialogue = recentDialogue.slice(firstNewline + 1);
    }
  }
}

launch().catch(e => log.error(e));