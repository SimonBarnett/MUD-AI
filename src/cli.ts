import readline from 'readline';
import { MUDAgent } from './agent/agent';
import { MUDClient } from './mud-client/client';
import { log, banner } from './logger';

export function startInteractiveCLI() {
  banner();
  log.success('Interactive CLI ready. Type hints or commands. Type "!connect" to link to MUD.');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: chalk.green('MUD-AI> ')
  });

  const agent = new MUDAgent();
  const mud = new MUDClient();

  rl.prompt();

  rl.on('line', async (line) => {
    const input = line.trim();
    if (input === 'exit' || input === 'quit') {
      rl.close();
      return;
    }

    log.hint(input);

    if (input.startsWith('!connect')) {
      mud.connect();
      log.success('Attempting real telnet connection...');
    } else {
      const result = await agent.think('Interactive session', input);
      console.log(result);
    }

    rl.prompt();
  });

  console.log('🎮 Interactive mode active — throw hints freely!');
}
