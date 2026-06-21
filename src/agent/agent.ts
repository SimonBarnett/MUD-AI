// src/agent/agent.ts - v0.6.31-strict-contracts
import 'dotenv/config';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import { searchMemories } from '../context-engine/memory.js';
import { log } from '../logger.js';

const getLogDir = (): string => {
  if (process.env.CURRENT_RUN_LOG_DIR) return process.env.CURRENT_RUN_LOG_DIR;
  const fallback = path.join(process.cwd(), 'logs', new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-'));
  if (!fs.existsSync(fallback)) fs.mkdirSync(fallback, { recursive: true });
  return fallback;
};

const DEBUG_LOG_PATH = path.join(getLogDir(), 'debug.log');

function logDebug(message: string, level: 'INFO' | 'ERROR' | 'DEBUG' = 'INFO') {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] [${level}] ${message}\n`;
  try { fs.appendFileSync(DEBUG_LOG_PATH, line); } catch {}
  if (level === 'ERROR') log.error(message);
}

const aiLogPath = path.join(getLogDir(), 'ai-calls.log');

function logAICall(stage: string, systemPrompt: string, response: any, usage?: any) {
  const timestamp = new Date().toISOString();
  const logEntry = `\n════════════════════════════════════════════════════════════════\n[${timestamp}] STAGE: ${stage}\n────────────────────────────────────────────────────────────────\nSYSTEM PROMPT:\n${systemPrompt}\n────────────────────────────────────────────────────────────────\nRESPONSE:\n${typeof response === 'string' ? response : JSON.stringify(response, null, 2)}\n${usage ? `USAGE: ${JSON.stringify(usage)}` : ''}\n════════════════════════════════════════════════════════════════\n`;
  fs.appendFileSync(aiLogPath, logEntry);
}

const xai = new OpenAI({
  apiKey: process.env.XAI_API_KEY,
  baseURL: "https://api.x.ai/v1"
});

export class MUDAgent {
  private consecutiveSameActions = 0;
  private lastActions: string[] = [];

  constructor() {}

  async react(input: string, options: { ultraShort?: any[] } = {}) {
    const system = `REACT MODE — MEMORY GENERATION ONLY (STRICT RULES v0.6.31)

You receive recent game output.

PRIMARY JOB: Generate useful, savable observations.

CRITICAL RULE: You must almost NEVER return immediateAction.
Only return it for REAL immediate danger.
On menus, login screens, and character creation: produce observations only.

Respond with valid JSON only.`;

    try {
      const res = await xai.chat.completions.create({
        model: "grok-4",
        messages: [{ role: "system", content: system }, { role: "user", content: input }],
        temperature: 0.1,
        max_tokens: 800
      });
      const content = res.choices[0]?.message?.content || '{}';
      let parsed;
      try { parsed = JSON.parse(content); }
      catch {
        const match = content.match(/"immediateAction"\s*:\s*"([^"]+)"/);
        parsed = match ? { immediateAction: match[1] } : { immediateAction: null, observations: [] };
      }
      logAICall('REACT', system, parsed, res.usage);
      return parsed;
    } catch (e: any) {
      logDebug(`React error: ${e.message}`, 'ERROR');
      return { immediateAction: null, observations: [] };
    }
  }

  async think(recentMemories: any[], gameBuffer: string, goalMemory?: string) {
    const system = `THINK MODE — STRICT "ACTION OR REFLECT" CONTRACT + GOALS (v0.6.31)

You are controlling a character in Achaea.

=== STRICT RULES ===
- You MUST choose exactly one: Set "action" OR set "shouldReflect": true. Never both, never neither.
- [GOAL] memories are high priority. Work toward completing them.
- On main menu: send "1" (login) or "2" (create).
- At name prompt ("Enter an option or enter your character's name."): send the character name from [GOAL].
- Never send password or menu numbers at the wrong state.
- If stuck or unsure, set shouldReflect: true.

Return ONLY valid JSON.`;

    try {
      const res = await xai.chat.completions.create({
        model: "grok-4",
        messages: [{ role: "system", content: system }, { role: "user", content: `Recent memories: ${JSON.stringify(recentMemories.slice(-8))}\nGame buffer: ${gameBuffer}` }],
        temperature: 0.2,
        max_tokens: 600
      });
      let parsed = JSON.parse(res.choices[0]?.message?.content || '{}');
      if (!parsed.action && !parsed.shouldReflect) parsed = { shouldReflect: true };
      logAICall('THINK', system, parsed, res.usage);
      return parsed;
    } catch (e: any) {
      logDebug(`Think error: ${e.message}`, 'ERROR');
      return { shouldReflect: true };
    }
  }

  async decide(freshMemories: any[]) {
    const system = `DECIDE MODE — FINAL ACTION (v0.6.31)

You MUST return a valid command.
Never return null or garbage.
If on main menu, follow menu rules.
If at name prompt, send the name from [GOAL].
After successful creation, return exactly: { "command": "SAVE_USERNAME:YourName" }

Return valid JSON with "command".`;

    try {
      const res = await xai.chat.completions.create({
        model: "grok-4",
        messages: [{ role: "system", content: system }, { role: "user", content: JSON.stringify(freshMemories) }],
        temperature: 0.1,
        max_tokens: 300
      });
      let parsed = JSON.parse(res.choices[0]?.message?.content || '{}');
      if (!parsed.command) parsed = { command: null };
      logAICall('DECIDE', system, parsed, res.usage);
      return parsed;
    } catch (e: any) {
      logDebug(`Decide error: ${e.message}`, 'ERROR');
      return { command: null };
    }
  }

  async queryMemories(queries: string[]) {
    try {
      const results = await Promise.all(queries.map(q => searchMemories(q, 6)));
      return Array.from(new Map(results.flat().map(m => [m.id, m])).values());
    } catch {
      return [];
    }
  }
}

export default MUDAgent;