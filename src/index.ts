// src/index.ts - v0.4.3-SMART-FINAL — Password regeneration + pure name
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

banner();
log.success('🚀 MUD-AI v0.4.3-SMART-FINAL — Password regeneration');

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
  return p[Math.floor(Math.random()*p.length)] + s[Math.floor(Math.random()*s.length)];
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

  mud.connect();
  loggedIn = true;
}

async function launch() {
  mud.onCLICommand = async (input) => {
    const c = input.trim();
    if (c === '!login') { await start(); return; }
    if (c === '!auto') { autoMode = !autoMode; log.success(`Autopilot ${autoMode?'ON':'OFF'}`); return; }
    if (c === '!cls') { process.stdout.write('\x1B[2J\x1B[3J\x1B[H'); return; }
    if (c === '!help') { log.success('!login | !auto | !cls | !exit'); return; }
    if (c === '!exit') process.exit(0);
    if (loggedIn) mud.sendCommand({ action: 'send_command', command: c });
  };

  startInteractiveCLI(agent, mud, (m) => { autoMode = m; });

  setInterval(async () => {
    if (!autoMode || !loggedIn) return;
    if (Date.now() - lastActivity < 1700) return;

    log.info('🤔 Second thought...');
    await ingestEvent(buffer, { state: currentState });
    const d = await agent.think(buffer, { state: currentState, forcedName: desiredUsername });
    if (d.action !== 'noop') mud.sendCommand(d);
    lastActivity = Date.now();
  }, 1900);

  mud.on('data', async (raw) => {
    if (!autoMode) return;
    lastActivity = Date.now();
    const clean = raw.replace(/Press enter to continue ��/g, '');
    buffer += clean + '\n';
    const t = buffer.toLowerCase();

    if (t.includes('1.') && t.includes('2.') && t.includes('3.')) {
      const choice = isCreationMode ? '2' : '1';
      log.success(`📋 Menu → ${choice}`);
      mud.sendCommand({ action: 'send_command', command: choice });
      buffer = '';
      return;
    }

    if (t.includes('name you wish') || t.includes('part 1')) {
      mud.sendCommand({ action: 'send_command', command: desiredUsername });
      buffer = '';
      return;
    }

    if (t.includes('new password') || t.includes('confirm your password')) {
      mud.sendCommand({ action: 'send_command', command: desiredPassword });
      buffer = '';
      return;
    }

    // PASSWORD REJECTION → NEW PASSWORD
    if (t.includes('different than your character name') || t.includes('too short') || t.includes('do not match') || t.includes('longer than')) {
      log.success('🔄 Password rejected → generating new one');
      desiredPassword = generateLongPassword();
      mud.sendCommand({ action: 'send_command', command: desiredPassword });
      buffer = '';
      return;
    }

    if (t.includes('health') || t.includes('exits')) {
      if (isCreationMode) saveCredentials();
      log.success('🎉 In game!');
    }
  });

  log.success('✅ Type !login');
}

launch().catch(e => log.error(e));