// src/index.ts - CLEAN WITH AUTO MODE + NO CONFLICTS + REAL FLOW
// (User provided code + committed as-is + enhancements for completeness)
import chalk from 'chalk';
import dotenv from 'dotenv';
import { startInteractiveCLI } from './cli.js';
import { MUDAgent } from './agent/agent.js';
import { MUDClient } from './mud-client/client.js';
import { ingestEvent } from './context-engine/ingestion.js';
import { log, banner } from './logger.js';
dotenv.config();
banner();
log.success('MUD-AI clean playable demo starting...');
const agent = new MUDAgent();
const mud = new MUDClient();
let autoMode = true;
async function launch() {
  log.info('Initializing clean real end-to-end...');
 
  await ingestEvent('Boot - Grok enters Discworld', { source: 'boot' });
  mud.connect();
  startInteractiveCLI(agent, mud, (mode) => autoMode = mode); // Toggle auto
  // Clean data listener (autoMode respected)
  mud.on('data', async (rawOutput, parsed) => {
    if (!autoMode) return;
    try {
      await ingestEvent(rawOutput, parsed);
      const decision = await agent.think(rawOutput, parsed);
      mud.sendCommand(decision);
      log.success('✅ Real MUD data processed - decision: ' + decision);
    } catch (e) {
      log.error('Data processing robustness: ' + e);
    }
  });
  log.success('✅ CLEAN REAL END-TO-END ACTIVE! Type !auto to toggle autonomous mode.');
}
launch().catch(err => {
  log.error('Robust boot fallback: ' + err);
  process.exit(1);
});
export { agent, mud };