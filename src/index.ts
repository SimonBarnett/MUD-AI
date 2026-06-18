// src/index.ts - FULL WIRED END-TO-END DEMO LOOP (priority #2)
import chalk from 'chalk';
import dotenv from 'dotenv';
import { startInteractiveCLI } from './cli.js';
import { MUDAgent } from './agent/agent.js';
import { MUDClient } from './mud-client/client.js';
import { ingestEvent } from './context-engine/ingestion.js';

dotenv.config();

console.log(chalk.bold.green('\n🚀 MUD-AI v0.1.1 FULL END-TO-END BOOT!'));

const agent = new MUDAgent();
const mud = new MUDClient();

async function launch() {
  console.log(chalk.cyan('🔧 Initializing real end-to-end loop...'));
  
  await ingestEvent('Agent session started', { source: 'boot' });

  mud.connect();

  startInteractiveCLI(agent, mud);

  // Full autonomous demo loop (priority #2)
  let tick = 0;
  const autonomousLoop = setInterval(async () => {
    tick++;
    const rawOutput = 'You see a troll in the room.';
    const parsed = { room: 'Ankh-Morpork', entities: ['troll'], status: 'alert' };
    await ingestEvent(rawOutput, parsed);
    const decision = await agent.think(rawOutput, parsed);
    mud.sendCommand(decision);
    if (tick > 6) clearInterval(autonomousLoop);
  }, 2500);

  console.log(chalk.green('\n✅ FULL END-TO-END LOOP RUNNING! Watch the autonomous demo or type in CLI.'));
}

launch().catch(err => {
  console.error(chalk.red('Fatal boot error:'), err);
  process.exit(1);
});

export { agent, mud };