// src/index.ts - v0.5.3 CLEAN - EXACT 4-stage system you asked for
import 'dotenv/config';
import { MUDAgent } from './agent/agent.js';
import { MUDClient } from './mud-client/client.js';
import { memorizeFromUser, queryMemories, queryMemoriesByTag } from './memory-store.js';
import { log, banner } from './logger.js';
import { startInteractiveCLI } from './cli.js';

banner();
log.success('🚀 MUD-AI — Exact 4-stage thinking (React/Think/Reflect/Decide)');

const agent = new MUDAgent();
const mud = new MUDClient();

let autoMode = true;
let loggedIn = false;
let fullBuffer = '';
let lastActivity = Date.now();

let ultraShortMemories: string[] = [];   // last 10 seconds
let recentMemories: string[] = [];       // last 2 minutes
let persistentMemories: string[] = [];

async function init() {
  persistentMemories = await queryMemoriesByTag('persistent', { minScore: 8 });
  await memorizeFromUser("System: Follow the strict 4-stage protocol exactly.");
  loggedIn = true;
  mud.connect();
  log.success('✅ 4-stage brain active — type !auto');
}

// React() - every line ending
setInterval(async () => {
  if (!autoMode || !loggedIn) return;
  const line = fullBuffer.split('\n').pop()?.trim();
  if (!line) return;

  const result = await agent.react(line, { ultraShortMemories, persistentMemories });

  if (result.immediateAction) {
    mud.sendCommand(result.immediateAction);
  } else if (result.observations) {
    result.observations.forEach(obs => {
      memorizeFromUser(obs);           // duplicates increase persistence
      ultraShortMemories.push(obs);
      recentMemories.push(obs);
    });
  }
}, 100);

// Think() - after 1.5s silence
setInterval(async () => {
  if (!autoMode || !loggedIn || Date.now() - lastActivity < 1500) return;
  if (!fullBuffer.trim()) return;

  const result = await agent.think(fullBuffer.trim(), { recentMemories, persistentMemories });

  result.observations?.forEach(obs => memorizeFromUser(obs));

  if (result.action) {
    mud.sendCommand(result.action);
  } else if (result.shouldReflect) {
    const queries = await agent.reflect({ recentMemories, persistentMemories });
    const retrieved = await queryMemories(queries);
    const decision = await agent.decide(retrieved);
    if (decision.command) mud.sendCommand(decision.command);
  }

  fullBuffer = '';
}, 400);

mud.on('data', (data) => {
  if (!autoMode || !loggedIn) return;
  lastActivity = Date.now();
  fullBuffer += data + '\n';
});

mud.onCLICommand = (input) => {
  if (input === '!login') init();
  if (input === '!auto') autoMode = !autoMode;
};

startInteractiveCLI(agent, mud, (m) => autoMode = m);
init().catch(console.error);