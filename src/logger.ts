// src/logger.ts - PERSISTENT FILE + CONSOLE LOGGING (run/crash/push ready)
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';

const LOG_DIR = path.join(process.cwd(), 'logs');
const LOG_DATE = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
const LOG_FILE = path.join(LOG_DIR, `mud-ai-${LOG_DATE}.log`);

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function writeToFile(level: string, message: string) {
  try {
    ensureLogDir();
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] [${level}] ${message}\n`;
    fs.appendFileSync(LOG_FILE, line, 'utf8');
  } catch (e) {
    // Silent fail — never crash the app because of logging
  }
}

export const log = {
  success: (message: string) => {
    console.log(chalk.green('✅'), message);
    writeToFile('SUCCESS', message);
  },
  error: (message: string) => {
    console.log(chalk.red('❌ Error:'), message);
    writeToFile('ERROR', message);
  },
  info: (message: string) => {
    console.log(chalk.blue('ℹ️'), message);
    writeToFile('INFO', message);
  },
  hint: (message: string) => {
    console.log(chalk.yellow('💡 Hint:'), message);
    writeToFile('HINT', message);
  },
  debug: (message: string) => {
    if (process.env.DEBUG === 'true') {
      console.log(chalk.gray('🐛'), message);
      writeToFile('DEBUG', message);
    }
  }
};

export const banner = () => {
  console.log(chalk.bold.magenta('\n🏴‍☠️ MUD-AI Interactive CLI'));
  console.log(chalk.gray('Type commands or !connect to start MUD session. Type "exit" to quit.\n'));
};

export default { log, banner };