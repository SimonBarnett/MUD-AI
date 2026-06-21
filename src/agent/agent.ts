// src/agent/agent.ts - v0.6.10-login-creation
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

  // ============================================================
  // DESIGN PHILOSOPHY (v0.6.10 - LOGIN vs CREATION MODES)
  // ============================================================
  /*
    There are now TWO distinct operational modes, determined **only** by
    whether a real character name exists in the environment at startup:

    1. LOGIN MODE (USERNAME exists in .env)
       - The agent has a real character.
       - Core imperative: "Log in with my name + password from MUD_PASSWORD."
       - THINK should prefer returning an `action` to progress login.

    2. CREATION MODE (no USERNAME in .env)
       - The agent must create a new character using a cool temporary name.
       - Core imperative: "Create an account on the main menu (usually option 2).
         Use the password from MUD_PASSWORD. After success output SAVE_USERNAME:MyTempName."
       - THINK should be more willing to use `shouldReflect: true` or choose
         creation actions when on the main menu.

    REACT remains unchanged in responsibility (generate observations).
    THINK must still obey the strict "ACTION or REFLECT" contract in both modes.
  */

  // ==================== REACT (Memory generation focused) ====================
  async react(input: string, ctx: any) {
    const ultraShort = ctx.ultraShort || ctx.ultraShortMemories || [];

    const system = `REACT MODE — MEMORY GENERATION PRIORITY

You receive recent game output (may contain multiple lines / a screen dump):
${input}

Recent short-term memories (last ~10s):
${ultraShort.length ? ultraShort.join(' | ') : 'none'}

You are playing Achaea (MUD).

YOUR PRIMARY JOB:
Generate useful, savable observations that describe the current game state.
These observations will be stored as memories and fed to THINK later.

SECONDARY JOB (only when truly needed):
If the output shows REAL immediate danger (you are being attacked, health is critically low, you are falling, dying, poisoned badly, etc.) then return an "immediateAction" with the exact command to survive.

STRICT RULES:
- On login / main menu screens: Describe what you see (menu options, prompts). Do NOT treat repetitive lines as noise — they are state.
- Only use immediateAction for genuine emergencies. Prefer observations in all other cases.
- Never invent danger that isn't there.

Respond with valid JSON only:
{
  "immediateAction": "command string or null",
  "observations": ["observation 1", "observation 2", ...]
}`;

    try {
      const res = await xai.chat.completions.create({
        model: "grok-4",
        messages: [{ role: "system", content: system }],
        temperature: 0.12,
        max_tokens: 220
      });

      let parsed = JSON.parse(res.choices[0]?.message?.content || '{}');
      parsed = this.ensureObservations(parsed);
      logAICall('REACT', system, parsed, res.usage);
      return parsed;
    } catch (e: any) {
      log.error('React error:', e.message);
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
    return {
      immediateAction: null,
      observations: ["Screen state unclear or error during REACT"]
    };
  }

  // ==================== THINK (STRICT ACTION OR REFLECT + LOGIN/CREATION AWARENESS) ====================
  async think(buffer: string, ctx: any) {
    const recent = ctx.recent || ctx.recentMemories || [];
    const persistent = ctx.persistent || ctx.persistentMemories || [];

    const system = `THINK MODE — STRICT "ACTION OR REFLECT" CONTRACT + LOGIN/CREATION AWARENESS (v0.6.10)

You are controlling a character in Achaea.

Current game buffer:
${buffer}

Recent memories (from REACT):
${recent.length ? recent.join('\n') : 'none'}

Persistent / long-term memories:
${persistent.length ? persistent.join('\n') : 'none'}

══════════════════════════════════════════════════════════════════════════════
CRITICAL CONTRACT — YOU MUST OBEY THIS
══════════════════════════════════════════════════════════════════════════════

You have exactly TWO valid response paths. Choose ONE:

PATH A — RETURN AN ACTION
  If you have enough context and it is reasonable/safe:
  → Set "action": "the exact command to send"

PATH B — REQUEST DEEPER THINKING
  If you need more long-term memory, the situation is ambiguous, or you are on
  the main menu in creation mode:
  → Set "shouldReflect": true

FORBIDDEN: Returning neither action nor shouldReflect.

══════════════════════════════════════════════════════════════════════════════
LOGIN vs CREATION MODE (determined only by persistent memories)
══════════════════════════════════════════════════════════════════════════════

- If persistent memories contain a real character name (e.g. "My character name is X"):
    → You are in LOGIN MODE. Your job is to log in.
    → Prefer returning an action to progress login when possible.

- If persistent memories say you have no character and must create one:
    → You are in CREATION MODE. Your job is to create an account.
    → On the main menu you should usually choose option 2 (create character).
    → After successful creation you must output exactly: SAVE_USERNAME:YourTempName

Be decisive but safe. Never return neither action nor shouldReflect.

Output ONLY valid JSON.`;

    try {
      const res = await xai.chat.completions.create({
        model: "grok-4",
        messages: [{ role: "system", content: system }],
        temperature: 0.15,
        max_tokens: 580
      });

      let parsed = JSON.parse(res.choices[0]?.message?.content || '{}');
      parsed = this.validateAndEnforceThinkContract(parsed);
      logAICall('THINK', system, parsed, res.usage);
      return parsed;
    } catch (e: any) {
      log.error('Think error:', e.message);
      return this.getSafeDefaultThinkResult();
    }
  }

  // Contract enforcement (unchanged but still critical)
  private validateAndEnforceThinkContract(result: any): any {
    if (!result) result = {};

    const hasAction = result.action && typeof result.action === 'string' && result.action.trim().length > 0;
    const hasReflect = result.shouldReflect === true;

    if (!hasAction && !hasReflect) {
      result.shouldReflect = true;
      if (!Array.isArray(result.observations)) result.observations = [];
      result.observations.push("THINK contract violation — forced shouldReflect: true");
    }

    if (hasAction && hasReflect) {
      result.shouldReflect = false;
    }

    if (!result.current_state) result.current_state = "unknown";
    if (!Array.isArray(result.observations)) result.observations = [];

    return result;
  }

  private getSafeDefaultThinkResult() {
    return {
      observations: ["Error during THINK — defaulting to reflection for safety"],
      current_state: "unknown",
      shouldReflect: true
    };
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

Return ONLY a valid JSON array of 4-7 useful memory queries.

Example: ["What do I know about my current location?", "What is my current goal?"]`;

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

  // ==================== DECIDE ====================
  async decide(retrievedMemories: any[]) {
    const memoriesText = retrievedMemories
      .map((m, i) => `${i + 1}. ${m.content || m}`)
      .join('\n');

    const system = `DECIDE MODE — FINAL ACTION

Fresh memories from Reflect:
${memoriesText || 'No useful memories retrieved'}

You are playing Achaea.

Special rule: If you have successfully created a new character, you MUST output:
{ "command": "SAVE_USERNAME:YourNewName" }

Otherwise return a normal command or null if you have insufficient information.`;

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

  // ==================== HELPERS ====================
  isOnMainMenu(input: string): boolean {
    const lower = input.toLowerCase();
    return lower.includes('1. enter the game') &&
           lower.includes('2. create a new character') &&
           lower.includes('3. quit');
  }
}

export default MUDAgent;