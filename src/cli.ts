// src/cli.ts - FULLY FIXED !AUTO TOGGLE + STATE TRACKING + CONFIRMATION (critical bug resolved)
import readline from 'readline';
import chalk from 'chalk';
import { log, banner } from './logger.js';
import { MUDAgent } from './agent/agent.js';
import { MUDClient } from './mud-client/client.js';

export function startInteractiveCLI(agent: MUDAgent, mud: MUDClient, toggleAuto: (mode: boolean) => void) {
  banner();
  log.success('Interactive CLI active. Type !auto to toggle autonomous mode.');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: chalk.green('MUD-AI> ')
  });

  rl.prompt();

  let currentAutoMode = true; // Internal state tracking for toggle

  rl.on('line', async (line) => {
    const input = line.trim();
    try {
      if (input === 'exit') {
        rl.close();
        return;
      }
      if (input === '!auto') {
        currentAutoMode = !currentAutoMode; // PROPER TOGGLE - flips internal state
        toggleAuto(currentAutoMode);
        log.success(`Auto mode toggled to: ${currentAutoMode ? 'ON' : 'OFF'}`);
        return;
      }
      if (input === '!connect') mud.connect();
      else {
        log.success('Manual command sent: ' + input); // Confirmation
        const decision = await agent.think(input, { room: 'current', entities: ['npc'] });
        mud.sendCommand(decision);
      }
    } catch (e) {
      log.error('CLI robustness fallback: ' + e);
    }
    rl.prompt();
  });

  rl.on('close', () => log.info('Demo ended.'));
}

export default startInteractiveCLI;