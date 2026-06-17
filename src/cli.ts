// cli.ts - Fixed version: added missing chalk import, corrected module paths, added real integration
import readline from 'readline';
import chalk from 'chalk';
import { log, banner } from './logger.js';
import { MUDAgent } from './agent/agent.js';
import { MUDClient } from './mud-client/client.js';

export function startInteractiveCLI(agent: MUDAgent, mud: MUDClient) {
  banner();
  log.success('Interactive CLI ready. Type !connect, or any command/action for the agent.');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: chalk.green('MUD-AI> ')
  });

  rl.prompt();

  rl.on('line', async (line) => {
    const input = line.trim();
    
    if (input === 'exit' || input === 'quit') {
      log.info('Shutting down...');
      rl.close();
      process.exit(0);
    }

    if (input === '!connect' || input === 'connect') {
      mud.connect();
      log.success('MUD connection attempted.');
    } else if (input.startsWith('!')) {
      if (input === '!goals') {
        console.log(chalk.cyan('Current goals: Explore, Help, Collect memories'));
      } else {
        log.hint(`Unknown meta command: ${input}`);
      }
    } else if (input.length > 0) {
      const decision = await agent.think(input, 'Current MUD context: standing in Ankh-Morpork');
      mud.sendCommand(decision);
    }

    rl.prompt();
  });

  rl.on('close', () => {
    log.info('CLI closed. Goodbye!');
  });
}

export default startInteractiveCLI;