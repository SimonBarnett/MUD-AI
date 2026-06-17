// context-engine/ingestion.ts - Minimal working stub to prevent import errors
// In full version: LLM classify \u2192 generate multiple memory types \u2192 embed \u2192 store via memory.ts

import chalk from 'chalk';

export async function ingestEvent(rawEvent: string, context: any = {}) {
  console.log(chalk.gray('\ud83e\udde0 Ingesting event:'), rawEvent.substring(0, 80) + (rawEvent.length > 80 ? '...' : ''));
  
  console.log(chalk.green('\u2705 Event ingested into memory pipeline (stub)'));
  
  return { success: true, memoriesCreated: 2 };
}

export default { ingestEvent };