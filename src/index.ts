// src/index.ts
import 'dotenv/config';
import { startInteractiveCLI } from './cli.js';
import { MUDAgent } from './agent/agent.js';
import { MUDClient } from './mud-client/client.js';
import { ingestEvent } from './context-engine/ingestion.js';
import { log, banner } from './logger.js';
import { initMemoryDB, remember, memorizeFromUser, getLoginSequence } from './memory-store.js';

import ws from 'ws';
(global as any).WebSocket = ws;

banner();
log.success('🚀 MUD-AI v0.2 Supabase + Anti-Hang Starting...');

const agent = new MUDAgent();
const mud = new MUDClient();
let autoMode = true;
let buffer = '';
let lastActivity = Date.now();
let currentState = 'login_screen';

initMemoryDB();

async function launch() {
  await ingestEvent('Boot - Grok enters Discworld', { source: 'system' });
  mud.connect();

  startInteractiveCLI(agent, mud, (mode) => { autoMode = mode; });

  // Dynamic memory command
  mud.onCLICommand = async (cmd) => {
    if (cmd.startsWith('!memorize ')) {
      const text = cmd.slice(10).trim();
      await memorizeFromUser(text);
      log.success(`💾 Supabase memory saved: ${text}`);
    }
  };

  // Heartbeat - prevents hanging
  setInterval(async () => {
    if (Date.now() - lastActivity > 2200 && autoMode) {
      log.warn('⏰ Heartbeat (Supabase mode): No input → forcing decision');
      lastActivity = Date.now();
      const memories = await getLoginSequence();
      const decision = await agent.think(`No new input. Last known state: ${currentState}. Past login memories: ${memories.slice(-3).join(' | ')}`, { state: currentState });
      mud.sendCommand(decision);
    }
  }, 1500);

  mud.on('data', async (raw) => {
    if (!autoMode) return;

    const clean = raw.replace(/Press enter to continue ��/g, '');
    buffer += clean + '\n';
    lastActivity = Date.now();

    const t = buffer.toLowerCase();

    // State detection
    if (t.includes('mended drum') || t.includes('exits:')) currentState = 'in_game';
    else if (t.includes('capitalised') || t.includes('male or female')) currentState = 'character_creation';
    else currentState = 'login_screen';

    // Auto-record successful login
    if (t.includes('you have never logged in before') || t.includes('mended drum')) {
      await remember('successful_login_sequence', `g → ${currentState} → completed`);
    }

    const isNewTurn = t.includes('your choice:') || t.includes('enter the name') || 
                     t.includes('capitalised') || t.includes('male or female') || 
                     t.includes('screenreader') || t.includes('yes if you agree') ||
                     t.includes('exits:') || Date.now() - lastActivity > 1800;

    if (isNewTurn) {
      await ingestEvent(buffer, { state: currentState });
      const memories = await getLoginSequence();
      const decision = await agent.think(buffer + `\nPast memories: ${memories.slice(-2)}`, { state: currentState });
      mud.sendCommand(decision);
      buffer = '';
    }
  });

  log.success('✅ v0.2 Supabase Edition Loaded — Persistent memory + Heartbeat + !memorize');
}

launch().catch(e => log.error(e));