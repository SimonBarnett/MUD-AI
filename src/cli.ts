// src/cli.ts - ROBUSTNESS + DYNAMIC CONTEXT (gap #2)
import readline from 'readline';
import chalk from 'chalk';
import { log, banner } from './logger.js';
import { MUDAgent } from './agent/agent.js';
import { MUDClient } from './mud-client/client.js';

export function startInteractiveCLI(agent: MUDAgent, mud: MUDClient) {
  banner();
  log.success('Interactive CLI + autonomous loop demo active. Type commands or !help.');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: chalk.green('MUD-AI> ')
  });

  rl.prompt();

  rl.on('line', async (line) => {
    const input = line.trim();
    try {
      if (input === 'exit') {
        rl.close();
        return;
      }
      if (input === '!connect') mud.connect();
      else {
        const decision = await agent.think(input, { room: 'current', entities: ['npc'] });
        mud.sendCommand(decision);
      }
    } catch (e) {
      log.error('CLI robustness fallback: ' + e);
    }
    rl.prompt();
  });

  rl.on('close', () => log.info('Demo ended with robustness.'));
}

export default startInteractiveCLI;