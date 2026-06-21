// src/agent/agent.ts - v0.6.6 — React → Think → Reflect → Decide + Login/Creation Support
import 'dotenv/config';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import { searchMemories } from '../context-engine/memory.js';
import { log } from '../logger.js';

// ==================== PER-RUN AI CALL LOGGING ====================
const getLogDir = (): string => {
  if (process.env.CURRENT_RUN_LOG_DIR) {
    return process.env.CURRENT_RUN_LOG_DIR;
  }
  const fallback = path.join(process.cwd(), 'logs', new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-'));
  if (!fs.existsSync(fallback)) fs.mkdirSync(fallback, { recursive: true });
  return fallback;
};

const aiLogPath = path.join(getLogDir(), 'ai-calls.log');

function logAICall(stage: string, systemPrompt: string, response: any, usage?: any) {
  const timestamp = new Date().toISOString();
  const logEntry = `
══════════════════════════════════════════════════════════════════════════════
[${timestamp}] STAGE: ${stage}
──────────────────────────────────────────────────────────────────────────────
SYSTEM PROMPT:
${systemPrompt}
──────────────────────────────────────────────────────────────────────────────
RESPONSE:
${typeof response === 'string' ? response : JSON.stringify(response, null, 2)}
${usage ? `USAGE: ${JSON.stringify(usage)}` : ''}
══════════════════════════════════════════════════════════════════════════════
`;
  fs.appendFileSync(aiLogPath, logEntry);
}

const xai = new OpenAI({
  apiKey: process.env.XAI_API_KEY,
  baseURL: "https://api.x.ai/v1"
});

export class MUDAgent {

  // ==================== REACT ====================
  async react(line: string, ctx: any) {
    const ultraShort = ctx.ultraShort || ctx.ultraShortMemories || [];

    const system = `REACT MODE — ONE LINE ONLY
You receive only this single line: "${line}"
Last 10 seconds memories: ${ultraShort.length ? ultraShort.join(' | ') : 'none'}

You are playing Achaea.

Rules:
- If you see a numbered menu (especially 1. Enter, 2. Create, 3. Quit), this is the MAIN MENU. Usually just observe.
- Only return "immediateAction" for real immediate danger (attacked, dying, falling, very low health).
- Otherwise return observations only.

Respond with valid JSON only.`;

    try {
      const res = await xai.chat.completions.create({
        model: "grok-4",
        messages: [{ role: "system", content: system }],
        temperature: 0.1,
        max_tokens: 160
      });

      const parsed = JSON.parse(res.choices[0]?.message?.content || '{}');
      logAICall('REACT', system, parsed, res.usage);
      return parsed;
    } catch (e: any) {
      log.error('React error:', e.message);
      return { observations: [`Processed: ${line.substring(0, 80)}`] };
    }
  }

  // ==================== THINK (Strong Menu Safety) ====================
  async think(buffer: string, ctx: any) {
    const recent = ctx.recent || ctx.recentMemories || [];
    const persistent = ctx.persistent || ctx.persistentMemories || [];

    const system = `THINK MODE — MENU SAFETY MODE

You are controlling a character in Achaea.

Current game buffer:
${buffer}

Recent memories:
${recent.length ? recent.join('\n') : 'none'}

Persistent memories:
${persistent.length ? persistent.join('\n') : 'none'}

CRITICAL RULES (very important):
- If the buffer shows the main menu with options "1. Enter the game", "2. Create a new character", "3. Quit", this is the LOGIN / MAIN MENU.
- On the MAIN MENU you should almost always do NOTHING.
- Prefer setting "shouldReflect": false when on the main menu.
- Only set "shouldReflect": true if something clearly changed or there is new important information.
- Do NOT output random menu numbers (1, 2, or 3).

Output valid JSON:
{
  "observations": ["obs1", "obs2"],
  "current_state": "main_menu" | "character_creation" | "logged_in" | "unknown",
  "action"?: "command",
  "shouldReflect"?: boolean
}`;

    try {
      const res = await xai.chat.completions.create({
        model: "grok-4",
        messages: [{ role: "system", content: system }],
        temperature: 0.15,
        max_tokens: 480
      });

      const parsed = JSON.parse(res.choices[0]?.message?.content || '{}');
      logAICall('THINK', system, parsed, res.usage);
      return parsed;
    } catch (e: any) {
      log.error('Think error:', e.message);
      return {
        observations: ["Buffer analysed"],
        current_state: "main_menu",
        shouldReflect: false
      };
    }
  }

  // ==================== REFLECT (Robust) ====================
  async reflect(ctx: any) {
    const recent = ctx.recent || ctx.recentMemories || [];
    const persistent = ctx.persistent || ctx.persistentMemories || [];

    const system = `REFLECT MODE

You are an AI playing Achaea.

Recent memories:
${recent.length ? recent.join('\n') : 'none'}

Persistent memories:
${persistent.length ? persistent.join('\n') : 'none'}

Return ONLY a valid JSON array of 4-7 useful memory queries.
Example: ["What do I know about my current location?", "What is my current goal?"]

Do not add any explanation or text outside the JSON array.`;

    try {
      const res = await xai.chat.completions.create({
        model: "grok-4",
        messages: [{ role: "system", content: system }],
        temperature: 0.15,
        max_tokens: 300
      });

      const content = res.choices[0]?.message?.content || '[]';
      let parsed: string[];

      try {
        parsed = JSON.parse(content);
        if (!Array.isArray(parsed)) parsed = [];
      } catch {
        parsed = [
          "What is my current location and situation?",
          "What are my active goals or quests?",
          "What important events have happened recently?"
        ];
      }

      logAICall('REFLECT', system, parsed, res.usage);
      return parsed;
    } catch (e: any) {
      log.error('Reflect error:', e.message);
      return [
        "What do I know about my current location?",
        "Any active goals or threats?",
        "What is my current health and status?"
      ];
    }
  }

  // ==================== DECIDE (With Login & Character Creation Support) ====================
  async decide(retrievedMemories: any[]) {
    const memoriesText = retrievedMemories
      .map((m, i) => `${i + 1}. ${m.content || m}`)
      .join('\n');

    const system = `DECIDE MODE — FINAL ACTION

Fresh memories from Reflect:
${memoriesText || 'No useful memories retrieved'}

You are playing Achaea.

Special Commands:
- If you have successfully created a new character, output: SAVE_USERNAME:NewCharacterName
- If you need to log in, just send normal commands (character name, then password).

If you have no good information or context, return:
{ "command": null, "reasoning": "insufficient information" }

Otherwise return a useful command or the special SAVE_USERNAME command when appropriate.`;

    try {
      const res = await xai.chat.completions.create({
        model: "grok-4",
        messages: [{ role: "system", content: system }],
        temperature: 0.1,
        max_tokens: 120
      });

      const parsed = JSON.parse(res.choices[0]?.message?.content || '{"command":null}');
      logAICall('DECIDE', system, parsed, res.usage);
      return parsed;
    } catch (e: any) {
      log.error('Decide error:', e.message);
      return { command: null, reasoning: "error fallback" };
    }
  }

  // ==================== QUERY MEMORIES ====================
  async queryMemories(queries: string[]) {
    log.info(`🔍 Searching memories for ${queries.length} queries`);

    try {
      const results = await Promise.all(queries.map(q => searchMemories(q, 5)));
      const flat = results.flat();
      return Array.from(new Map(flat.map(m => [m.id, m])).values());
    } catch (e: any) {
      log.error('queryMemories error:', e.message);
      return [];
    }
  }
}

export default MUDAgent;