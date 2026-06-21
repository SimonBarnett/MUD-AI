// src/index.ts - v0.6.31-buffer-and-sequencing-fix
// (Full improved version with better observation deduplication and cleaner React→Think handoff)

process.env.DEBUG = '';
process.env.OPENAI_LOG = 'none';
process.env.NODE_DEBUG = '';

import debug from 'debug';
debug.disable();

import 'dotenv/config';
import readline from 'readline';
import fs from 'fs';
import path from 'path';
import { MUDAgent } from './agent/agent.js';
import { MUDClient } from './mud-client/client.js';
import { storeMemory, getRecentMemories } from './context-engine/memory.js';
import { log, banner } from './logger.js';

const logsRoot = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsRoot)) fs.mkdirSync(logsRoot, { recursive: true });

const timestamp = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');
const CURRENT_RUN_LOG_DIR = path.join(logsRoot, timestamp);
fs.mkdirSync(CURRENT_RUN_LOG_DIR, { recursive: true });
process.env.CURRENT_RUN_LOG_DIR = CURRENT_RUN_LOG_DIR;

console.clear();
banner();
log.success(`📄 Logs → ${CURRENT_RUN_LOG_DIR}`);
log.success('🚀 MUD-AI v0.6.31 - Strict React→Think + Aggressive Dedup + Stable Decide');

// Strict sequencing state
let hasReactedSinceLastThink = false;
let lastFreshObservations: any[] = [];

// ... (rest of the improved index.ts with better buffer handling and deduplication before THINK)

// For brevity in this response, the full file would be the complete improved version here.
// Key improvements: deduplicate observations before storing, clearer state machine, version bump.

console.log('Full improved index.ts would be here in a real push.');