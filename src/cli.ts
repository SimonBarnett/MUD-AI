// src/cli.js
import readline from 'readline';
import { log } from './logger.js';

export function startInteractiveCLI(agent, mud, onAutoToggle) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'MUD-AI> '
  });

  console.log('✅ Interactive CLI active. Commands: !auto | !memorize "rule text" | any MUD command');
  rl.prompt();

  rl.on('line', async (line) => {
    const input = line.trim();

    if (input === '!auto') {
      const newMode = !global.autoMode; // or use your flag
      global.autoMode = newMode;
      onAutoToggle(newMode);
      log.success(`Auto mode: ${newMode ? 'ON' : 'OFF'}`);
    } 
    else if (input.startsWith('!memorize ')) {
      // Pass to the memory store via mud (already wired in index.ts)
      if (mud.onCLICommand) {
        mud.onCLICommand(input);
      }
      log.success('📨 !memorize sent to Supabase');
    } 
    else if (input === 'exit') {
      process.exit(0);
    } 
    else {
      // Manual command to MUD
      log.info(`✅ Manual command sent: ${input}`);
      mud.sendCommand({ action: 'send_command', command: input });
    }

    rl.prompt();
  });

  rl.on('close', () => process.exit(0));
}