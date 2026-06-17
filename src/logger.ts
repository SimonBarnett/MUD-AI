// logger.ts - Created to fix missing module error from scan
// Provides simple colored logging and banner for CLI

import chalk from 'chalk';

export const log = {
  success: (message: string) => console.log(chalk.green('\u2705'), message),
  hint: (message: string) => console.log(chalk.yellow('\ud83d\udca1 Hint:'), message),
  error: (message: string) => console.log(chalk.red('\u274c Error:'), message),
  info: (message: string) => console.log(chalk.blue('\u2139\ufe0f'), message),
};

export const banner = () => {
  console.log(chalk.bold.magenta('\n\ud83c\udff4\u200d\u2620\ufe0f MUD-AI Interactive CLI'));
  console.log(chalk.gray('Type commands or !connect to start MUD session. Type "exit" to quit.\n'));
};

export default { log, banner };