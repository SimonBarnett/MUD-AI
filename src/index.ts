// src/index.ts
import debug from 'debug';
debug.disable();
process.env.DEBUG = '';
process.env.OPENAI_LOG = 'none';
process.env.FORCE_COLOR = '1';

import 'dotenv/config';
import { startInteractiveCLI } from './cli.js';
import { MUDAgent } from './agent/agent.js';
import { MUDClient } from './mud-client/client.js';
import { ingestEvent } from './context-engine/ingestion.js';
import { log, banner } from './logger.js';

import ws from 'ws';
(global as any).WebSocket = ws;

banner();
log.success('MUD-AI clean playable demo starting...');

const agent = new MUDAgent();
const mud = new MUDClient();
let autoMode = true;
let buffer = '';
let lastActivity = Date.now();
let waitingForResponse = false;
let lastThinkTime = 0;

async function launch() {
  await ingestEvent('Boot - Grok enters Discworld', { source: 'boot' });
  mud.connect();

  startInteractiveCLI(agent, mud, (mode) => { autoMode = mode; });

  mud.on('data', async (rawOutput) => {
    if (!autoMode) return;

    const cleanChunk = rawOutput.replace('Press enter to continue ��', '');
    buffer += cleanChunk + '\n';
    lastActivity = Date.now();

    const preview = cleanChunk.replace(/\n/g, ' ').substring(0, 80);
    log.info(`[BUFFER ${buffer.length}] ${preview}...`);

    const t = buffer.toLowerCase();

    // STRICT waiting logic
    if (waitingForResponse) {
      // Only unblock on these specific new-turn prompts
      const isNewTurnPrompt =
        t.includes('your choice:') ||
        t.includes('enter the name you wish') ||
        t.includes('sorry the player name') ||
        t.includes('please try again') ||
        t.includes('how would you like your name capitalised') ||
        t.includes('should your character be male or female') ||
        t.includes('are you using a screenreader') ||
        t.includes('enter \'yes\' if you agree');

      if (isNewTurnPrompt) {
        buffer = cleanChunk + '\n';           // fresh start
        waitingForResponse = false;
        log.info('🧹 New turn prompt detected — buffer cleared');
      } else {
        return;
      }
    }

    // Hard 1000ms debounce between any two think() calls
    if (Date.now() - lastThinkTime < 1000) {
      return;
    }

    // Clean turn detection
    const hasClearPrompt =
      t.includes('your choice:') ||
      t.includes('enter the name you wish') ||
      t.includes('g - guest character') ||
      t.includes('or, enter your current character') ||
      t.includes('are you using a screenreader') ||
      t.includes('should your character be male or female') ||
      t.includes('how would you like your name capitalised') ||
      t.includes('enter \'yes\' if you agree') ||
      t.includes('mended drum') ||
      t.includes('exits:') ||
      t.includes('>');

    const isComplete = hasClearPrompt || (Date.now() - lastActivity > 1000);

    if (!isComplete) {
      return;
    }

    try {
      await ingestEvent(buffer, {});

      const state = t.includes('mended drum') || t.includes('exits:') ? 'in_game' : 'login_screen';

      log.info(`🤖 Grok reasoning on CLEAN screen (state: ${state})`);

      const decision = await agent.think(buffer, { state });

      log.success(`💡 Grok decided: ${decision.command || '[press enter]'}`);
      mud.sendCommand(decision);

      lastThinkTime = Date.now();
      waitingForResponse = true;
      buffer = '';

    } catch (e) {
      log.error('Error: ' + e);
      mud.sendCommand({ action: 'press_enter' });
      lastThinkTime = Date.now();
      waitingForResponse = true;
      buffer = '';
    }
  });

  log.success('✅ FINAL STABLE VERSION — 1s debounce + strict new-turn detection');
}

launch().catch(err => log.error(err));