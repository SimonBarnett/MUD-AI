// src/logger.ts - Dated runtime folders + Grok debug logging
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';

const LOGS_ROOT = path.join(process.cwd(), 'logs');

// Generate a clean timestamp for the folder name
const runtimeTimestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const RUNTIME_LOG_DIR = path.join(LOGS_ROOT, runtimeTimestamp);

let logDirCreated = false;
let sessionHeaderWritten = false;

// Ensure the dated log directory exists
function ensureRuntimeLogDir() {
  if (logDirCreated) return;

  try {
    if (!fs.existsSync(RUNTIME_LOG_DIR)) {
      fs.mkdirSync(RUNTIME_LOG_DIR, { recursive: true });
    }
    logDirCreated = true;

    // Write initial session header
    const header = `=== MUD-AI SESSION STARTED: ${new Date().toISOString()} ===\n`;
    fs.appendFileSync(path.join(RUNTIME_LOG_DIR, 'runtime.log'), header, 'utf8');
  } catch (e) {
    // Silent fail - never crash the app over logging
  }
}

function writeToRuntimeLog(level: string, message: string) {
  try {
    ensureRuntimeLogDir();
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] [${level}] ${message}\n`;
    fs.appendFileSync(path.join(RUNTIME_LOG_DIR, 'runtime.log'), line, 'utf8');
  } catch (e) {
    // Silent fail
  }
}

// Public logging interface
export const log = {
  success: (message: string) => {
    console.log(chalk.green('✅'), message);
    writeToRuntimeLog('SUCCESS', message);
  },

  error: (message: string) => {
    console.log(chalk.red('❌ Error:'), message);
    writeToRuntimeLog('ERROR', message);
  },

  info: (message: string) => {
    console.log(chalk.blue('ℹ️'), message);
    writeToRuntimeLog('INFO', message);
  },

  hint: (message: string) => {
    console.log(chalk.yellow('💡 Hint:'), message);
    writeToRuntimeLog('HINT', message);
  },

  debug: (message: string) => {
    if (process.env.DEBUG === 'true') {
      console.log(chalk.gray('🐛'), message);
      writeToRuntimeLog('DEBUG', message);
    }
  }
};

// Banner (unchanged)
export const banner = () => {
  console.log(chalk.bold.magenta('\n🏴‍☠️ MUD-AI Interactive CLI'));
  console.log(chalk.gray('Type commands or !connect to start MUD session. Type "exit" to quit.\n'));
  console.log(chalk.gray(`📄 Logs → ${RUNTIME_LOG_DIR}\n`));
};

// =====================================================
// GROK DEBUG LOGGING (separate file)
// =====================================================
export function logGrokInteraction(prompt: string, response: any) {
  try {
    ensureRuntimeLogDir();
    const timestamp = new Date().toISOString();
    const entry = {
      timestamp,
      prompt,
      response
    };

    const debugPath = path.join(RUNTIME_LOG_DIR, 'grok-debug.log');
    fs.appendFileSync(debugPath, JSON.stringify(entry, null, 2) + '\n\n', 'utf8');
  } catch (e) {
    // Silent fail
  }
}

export default { log, banner, logGrokInteraction };