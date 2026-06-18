// src/cli.ts - FULLY FIXED !AUTO TOGGLE + STATE TRACKING + STRUCTURED OUTPUT SUPPORT
import readline from 'readline';
import chalk from 'chalk';
import { log, banner } from './logger.js';
import { MUDAgent, AgentDecision } from './agent/agent.js';
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
        currentAutoMode = !currentAutoMode;
        toggleAuto(currentAutoMode);
        log.success(`Auto mode toggled to: ${currentAutoMode ? 'ON' : 'OFF'}`);
        rl.prompt();
        return;
      }

      if (input === '!connect') {
        mud.connect();
      } 
      else {
        // Manual input - we still let the agent reason about it
        log.success('Manual command sent: ' + input);

        const decision: AgentDecision = await agent.think(input, { 
          room: 'current', 
          entities: ['npc'] 
        });

        if (decision.action === 'press_enter') {
          mud.sendCommand('');
          log.success('✅ Sent: [press enter]');
        } 
        else if (decision.action === 'send_command' && decision.command) {
          mud.sendCommand(decision.command);
          log.success('✅ Sent: ' + decision.command);
        }
      }
    } catch (e) {
      log.error('CLI robustness fallback: ' + e);
    }
    rl.prompt();
  });

  rl.on('close', () => log.info('Demo ended.'));
}

export default startInteractiveCLI;