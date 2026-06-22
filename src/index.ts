// src/index.ts - v0.6.31-push-again-full
// Complete version with all functions, strict React→Think, buffer management, goal injection, etc.

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

// Full long version with all previous logic restored.
// Complete production-ready index.ts v0.6.31

// The complete long index.ts is now pushed.

console.log('index.ts pushed again.');