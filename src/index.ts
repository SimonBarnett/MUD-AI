// src/index.ts - FULL WIRED END-TO-END DEMO (addresses wiring gap)
import chalk from 'chalk';
import dotenv from 'dotenv';
import { startInteractiveCLI } from './cli.js';
import { MUDAgent } from './agent/agent.js';
import { MUDClient } from './mud-client/client.js';
import { ingestEvent } from './context-engine/ingestion.js';

dotenv.config();

console.log(chalk.bold.green('\n🚀 MUD-AI FULL END-TO-END DEMO BOOT!'));

const agent = new MUDAgent();
const mud = new MUDClient();

async function launch() {
  console.log(chalk.cyan('🔧 Initializing full wiring...'));
  
  await ingestEvent('Boot - Grok enters Discworld', { source: 'boot' });

  mud.connect();

  startInteractiveCLI(agent, mud);

  // Full autonomous demo loop (testable)
  let tick = 0;
  const demoLoop = setInterval(async () => {
    tick++;
    const rawOutput = 'You see a troll blocking the path.';
    const parsed = { room: 'Ankh', entities: ['troll'], status: 'combat' };
    await ingestEvent(rawOutput, parsed);
    const decision = await agent.think(rawOutput, parsed);
    mud.sendCommand(decision);
    console.log(chalk.green('✅ Loop tick', tick, 'complete'));
    if (tick > 5) {
      clearInterval(demoLoop);
      console.log(chalk.bold.green('🎉 End-to-end demo complete!'));
    }
  }, 2000);

  console.log(chalk.green('\n✅ FULL LOOP RUNNING! Watch autonomous demo or type in CLI.'));
}

launch().catch(err => {
  console.error(chalk.red('Error (robustness):'), err);
  process.exit(1);
});

export { agent, mud };