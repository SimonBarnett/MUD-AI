// src/agent/agent.ts - v0.6.26-goals-support
import 'dotenv/config';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import { 
  searchMemories, 
  storeGoal, 
  clearCompletedGoal 
} from '../context-engine/memory.js';
import { log } from '../logger.js';

const getLogDir = (): string => {
  if (process.env.CURRENT_RUN_LOG_DIR) {
    return process.env.CURRENT_RUN_LOG_DIR;
  }
  const fallback = path.join(process.cwd(), 'logs', new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-'));
  if (!fs.existsSync(fallback)) fs.mkdirSync(fallback, { recursive: true });
  return fallback;
};

const DEBUG_LOG_PATH = path.join(getLogDir(), 'debug.log');

function logDebug(message: string, level: 'INFO' | 'ERROR' | 'DEBUG' = 'INFO') {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] [${level}] ${message}\n`;

  try {
    fs.appendFileSync(DEBUG_LOG_PATH, line);
  } catch (e) {
    console.error('Failed to write to debug.log from agent:', e);
  }

  if (level === 'ERROR') {
    log.error(message);
  }
}

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

  private lastActions: string[] = [];
  private consecutiveSameActions = 0;

  // ==================== GOAL MANAGEMENT ====================

  /**
   * Store a high-priority goal / motivation.
   * These are treated differently from normal facts.
   */
  async storeGoal(goal: string): Promise<void> {
    try {
      await storeGoal(goal);
      logDebug(`Stored goal: ${goal}`);
    } catch (e: any) {
      logDebug(`Failed to store goal: ${e.message}`, 'ERROR');
    }
  }

  /**
   * Remove a completed goal from memory.
   * Call this once the agent has successfully achieved the goal.
   */
  async clearCompletedGoal(goalDescription: string): Promise<void> {
    try {
      await clearCompletedGoal(goalDescription);
      logDebug(`Cleared completed goal: ${goalDescription}`);
    } catch (e: any) {
      logDebug(`Failed to clear goal: ${e.message}`, 'ERROR');
    }
  }

  // ==================== REACT ====================

  async react(input: string, ctx: any) {
    const ultraShort = ctx.ultraShort || ctx.ultraShortMemories || [];

    const system = `REACT MODE — MEMORY GENERATION ONLY (STRICT RULES v0.6.26)

You receive recent game output:
${input}

Recent short-term memories (last ~10s):
${ultraShort.length ? ultraShort.join(' | ') : 'none'}

You are playing Achaea (MUD).

PRIMARY JOB: Generate useful, savable observations.

CRITICAL RULE: You must almost NEVER return immediateAction.
Only return it for REAL immediate danger.
On menus, login screens, and character creation: produce observations only.

Respond with valid JSON only:
{
  "immediateAction": "command string or null",
  "observations": ["observation 1", "observation 2", ...]
}`;

    try {
      const res = await xai.chat.completions.create({
        model: "grok-4",
        messages: [{ role: "system", content: system }],
        temperature: 0.1,
        max_tokens: 280
      });

      let parsed = JSON.parse(res.choices[0]?.message?.content || '{}');
      parsed = this.ensureObservations(parsed);
      logAICall('REACT', system, parsed, res.usage);
      return parsed;
    } catch (e: any) {
      logDebug(`React error: ${e.message}`, 'ERROR');
      return this.getEmptyReactResponse();
    }
  }

  private ensureObservations(result: any) {
    if (!result) result = {};
    if (!Array.isArray(result.observations)) result.observations = [];
    if (result.immediateAction === undefined) result.immediateAction = null;
    return result;
  }

  private getEmptyReactResponse() {
    return { immediateAction: null, observations: ["Screen state unclear"] };
  }

  // ==================== THINK ====================

  async think(buffer: string, ctx: any) {
    const recent = ctx.recent || ctx.recentMemories || [];
    const persistent = ctx.persistent || ctx.persistentMemories || [];

    const system = `THINK MODE — STRICT "ACTION OR REFLECT" CONTRACT + GOALS + MENU RULES (v0.6.26)

You are controlling a character in Achaea.

Current game buffer:
${buffer}

Recent memories (from REACT):
${recent.length ? recent.join('\n') : 'none'}

Persistent / long-term memories:
${persistent.length ? persistent.join('\n') : 'none'}

You must choose exactly one of two paths:

PATH A — Set "action": "exact command"
PATH B — Set "shouldReflect": true

FORBIDDEN: Returning neither or both.

=== GOALS vs FACTS ===

- Memories starting with [GOAL] are active motivations/quests. Treat them as high priority.
- Normal memories are facts about the world.
- If a [GOAL] memory exists (e.g. login), you should work toward completing it.

=== CRITICAL STATE DISTINCTION ===

1. MAIN MENU STATE
   - You see: "1. Enter the game", "2. Create a new character", "3. Quit"
   - Login Mode → send "1"
   - Creation Mode → send "2"

2. NAME PROMPT STATE (VERY IMPORTANT)
   - You see: "Enter an option or enter your character's name."
   - This is **NOT** the main menu anymore.
   - In Login Mode: You MUST now send your character name.
   - Do NOT send "1" or "2" here.

TEMP NAME + PASSWORD RULES (MANDATORY):
- If persistent memory says you are using a temporary name, use exactly that name during creation.
- Never send your Windows login name.
- When asked for password and confirm password, send the exact same value from MUD_PASSWORD both times.

After successful character creation, output exactly: SAVE_USERNAME:YourTempName

Output ONLY valid JSON.`;

    try {
      const res = await xai.chat.completions.create({
        model: "grok-4",
        messages: [{ role: "system", content: system }],
        temperature: 0.15,
        max_tokens: 860
      });

      let parsed = JSON.parse(res.choices[0]?.message?.content || '{}');
      parsed = this.validateAndEnforceThinkContract(parsed);
      parsed = this.trackActionHistory(parsed);
      logAICall('THINK', system, parsed, res.usage);
      return parsed;
    } catch (e: any) {
      logDebug(`Think error: ${e.message}`, 'ERROR');
      return this.getSafeDefaultThinkResult();
    }
  }

  private validateAndEnforceThinkContract(result: any): any {
    if (!result) result = {};
    const hasAction = result.action && typeof result.action === 'string' && result.action.trim().length > 0;
    const hasReflect = result.shouldReflect === true;

    if (!hasAction && !hasReflect) {
      result.shouldReflect = true;
      if (!Array.isArray(result.observations)) result.observations = [];
      result.observations.push("Contract violation — forced shouldReflect");
    }
    if (hasAction && hasReflect) result.shouldReflect = false;
    if (!result.current_state) result.current_state = "unknown";
    if (!Array.isArray(result.observations)) result.observations = [];
    return result;
  }

  private trackActionHistory(result: any) {
    if (result.action && typeof result.action === 'string') {
      const action = result.action.trim();
      if (this.lastActions.length > 0 && this.lastActions[this.lastActions.length - 1] === action) {
        this.consecutiveSameActions++;
      } else {
        this.consecutiveSameActions = 1;
      }
      this.lastActions.push(action);
      if (this.lastActions.length > 8) this.lastActions.shift();

      if (this.consecutiveSameActions >= 3 && result.shouldReflect !== true) {
        result.shouldReflect = true;
        result.action = null;
        if (!result.observations) result.observations = [];
        result.observations.push("Repeated failed action — forcing reflection");
      }
    }
    return result;
  }

  private getSafeDefaultThinkResult() {
    return { observations: ["Error — defaulting to reflection"], current_state: "unknown", shouldReflect: true };
  }

  // ==================== REFLECT ====================

  async reflect(ctx: any) {
    const recent = ctx.recent || ctx.recentMemories || [];
    const persistent = ctx.persistent || ctx.persistentMemories || [];

    const system = `REFLECT MODE

Recent memories:
${recent.length ? recent.join('\n') : 'none'}

Persistent memories:
${persistent.length ? persistent.join('\n') : 'none'}

Return ONLY a valid JSON array of 4-7 useful memory queries.`;

    try {
      const res = await xai.chat.completions.create({
        model: "grok-4",
        messages: [{ role: "system", content: system }],
        temperature: 0.15,
        max_tokens: 360
      });

      let parsed;
      try {
        parsed = JSON.parse(res.choices[0]?.message?.content || '[]');
        if (!Array.isArray(parsed)) parsed = [];
      } catch {
        parsed = ["What is my current situation?", "What should I do next?"];
      }

      logAICall('REFLECT', system, parsed, res.usage);
      return parsed;
    } catch (e: any) {
      logDebug(`Reflect error: ${e.message}`, 'ERROR');
      return ["What is my current situation?", "What should I do next?"];
    }
  }

  // ==================== DECIDE ====================

  async decide(retrievedMemories: any[]) {
    const memoriesText = retrievedMemories
      .map((m, i) => `${i + 1}. ${m.content || m}`)
      .join('\n');

    const system = `DECIDE MODE — FINAL ACTION + GOALS (v0.6.26)

Fresh memories from Reflect:
${memoriesText || 'No useful memories retrieved'}

You are playing Achaea.

MANDATORY RULES:
1. You MUST return a command. Never return null.
2. [GOAL] memories represent active motivations. Prioritize completing them when possible.
3. If you see "Enter an option or enter your character's name.", send the character name.
4. If you see the main menu with options 1/2/3, follow menu rules.
5. After successful character creation, output exactly: { "command": "SAVE_USERNAME:YourTempName" }

Return a valid JSON object with a "command" field.`;

    try {
      const res = await xai.chat.completions.create({
        model: "grok-4",
        messages: [{ role: "system", content: system }],
        temperature: 0.12,
        max_tokens: 300
      });

      let content = res.choices[0]?.message?.content || '';
      let parsed;

      try {
        parsed = JSON.parse(content);
      } catch {
        const match = content.match(/"command"\s*:\s*"([^"]+)"/);
        parsed = match ? { command: match[1] } : null;
      }

      if (typeof parsed === 'string' || typeof parsed === 'number') {
        parsed = { command: String(parsed) };
      }

      if (!parsed || typeof parsed !== 'object' || !parsed.command) {
        parsed = { command: null };
      }

      logAICall('DECIDE', system, parsed, res.usage);
      return parsed;
    } catch (e: any) {
      logDebug(`Decide error: ${e.message}`, 'ERROR');
      return { command: null };
    }
  }

  // ==================== QUERY MEMORIES ====================

  async queryMemories(queries: string[]) {
    log.info(`🔍 Searching memories for ${queries.length} queries`);

    try {
      const results = await Promise.all(queries.map(q => searchMemories(q, 5)));
      const flat = results.flat();
      return Array.from(new Map(flat.map(m => [m.id, m])).values()).slice(0, 25);
    } catch (e: any) {
      logDebug(`queryMemories error: ${e.message}`, 'ERROR');
      return [];
    }
  }

  // ==================== HELPERS ====================

  isOnMainMenu(input: string): boolean {
    const lower = input.toLowerCase();
    return lower.includes('1. enter the game') && lower.includes('2. create a new character');
  }

  isStuckInLoginLoop(): boolean {
    return this.consecutiveSameActions >= 3;
  }

  resetActionHistory() {
    this.lastActions = [];
    this.consecutiveSameActions = 0;
  }
}

export default MUDAgent;