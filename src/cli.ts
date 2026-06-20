// src/cli.js
import readline from 'readline';
import { log } from './logger.js';

export function startInteractiveCLI(agent, mud, onAutoToggle) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'MUD-AI> '
  });

  console.log('✅ Interactive CLI active. Commands: !help | !rules | !login | !auto | !memorize | !cls | !exit | any MUD command');
  rl.prompt();

  rl.on('line', async (line) => {
    const input = line.trim();

    if (!input) {
      rl.prompt();
      return;
    }

    // ────── !exit / !quit (only these kill the program) ──────
    if (input === '!exit' || input === '!quit') {
      log.info('👋 Exiting MUD-AI...');
      process.exit(0);
    }

    // ────── Route ALL other !commands to central handler in index.ts ──────
    if (input.startsWith('!')) {
      if (mud.onCLICommand) {
        await mud.onCLICommand(input);
      } else {
        log.warn('No onCLICommand handler registered yet');
      }
      rl.prompt();
      return;
    }

    // ────── Normal text → send to MUD ──────
    log.info(`✅ Manual command sent: ${input}`);
    mud.sendCommand({ action: 'send_command', command: input });

    rl.prompt();
  });

  rl.on('close', () => {
    log.info('CLI closed');
    process.exit(0);
  });
}