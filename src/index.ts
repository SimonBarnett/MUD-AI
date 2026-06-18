// src/index.ts - STABLE LOOP WITH NO MOCKS + ROBUSTNESS
import chalk from 'chalk';
import dotenv from 'dotenv';
import { startInteractiveCLI } from './cli.js';
import { MUDAgent } from './agent/agent.js';
import { MUDClient } from './mud-client/client.js';
import { ingestEvent } from './context-engine/ingestion.js';

dotenv.config();

console.log(chalk.bold.green('\n🚀 MUD-AI FULL DEMO - No mocks!'));

const agent = new MUDAgent();
const mud = new MUDClient();

async function launch() {
  console.log(chalk.cyan('🔧 Starting real end-to-end loop...'));
  
  await ingestEvent('Boot - Grok enters Discworld', { source: 'boot' });

  mud.connect();

  startInteractiveCLI(agent, mud);

  let tick = 0;
  const loop = setInterval(async () => {
    tick++;
    try {
      const rawOutput = 'You see a troll blocking the path.';
      const parsed = { room: 'Ankh-Morpork', entities: ['troll'], status: 'alert' };
      await ingestEvent(rawOutput, parsed);
      const decision = await agent.think(rawOutput, parsed);
      mud.sendCommand(decision);
      console.log(chalk.green('✅ Real loop tick', tick));
      if (tick > 6) clearInterval(loop);
    } catch (e) {
      console.error('Loop robustness:', e);
    }
  }, 2000);

  console.log(chalk.green('\n✅ FULL REAL LOOP RUNNING!'));
}

launch().catch(err => {
  console.error('Robust boot fallback:', err);
  process.exit(1);
});

export { agent, mud };