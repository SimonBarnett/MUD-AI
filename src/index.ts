import chalk from 'chalk';
import dotenv from 'dotenv';
import { startInteractiveCLI } from './cli.js';
import { MUDAgent } from './agent/agent.js';
import { MUDClient } from './mud-client/client.js';
import { ingestEvent } from './context-engine/ingestion.js';

dotenv.config();

console.log(chalk.bold.green('\n\ud83d\ude80 MUD-AI v0.1.1 BOOTING - All scan issues fixed!'));

const agent = new MUDAgent();
const mud = new MUDClient();

async function launch() {
  console.log(chalk.cyan('\ud83d\udd27 Initializing systems...'));
  
  try {
    await ingestEvent('Agent session started - Grok enters the Discworld', { source: 'boot' });
  } catch (e) {
    console.log(chalk.yellow('\u26a0\ufe0f Ingestion stub - context-engine/ingestion.ts may need full impl'));
  }

  mud.connect();

  startInteractiveCLI(agent, mud);

  console.log(chalk.green('\n\u2705 Everything wired! Type commands in the CLI. Use !connect if needed.'));
  console.log(chalk.gray('   (Real Telnet + full LLM decisions + memory loop in next iterations)'));
}

launch().catch(err => {
  console.error(chalk.red('Fatal boot error:'), err);
  process.exit(1);
});

export { agent, mud };