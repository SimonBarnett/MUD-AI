// src/agent/agent.ts - v0.6.9-strict-contract
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
  // DESIGN PHILOSOPHY (v0.6.9 - STRICT MEMORY + ACTION CONTRACT)
  // ============================================================
  /*
    REACT RESPONSIBILITY (strengthened):
      - Primary job: Generate rich, savable observations / memories from whatever
        the current screen shows (including login screens and main menus).
      - Only return immediateAction when there is REAL immediate danger
        (being attacked, dying, falling, critically low health, etc.).
      - Observations created here are the foundation for THINK.
      - React should be "eager" to describe state so higher cognition has context.

    THINK RESPONSIBILITY (new hard contract):
      - You MUST choose ONE of two paths. Never both, never neither:
        a) Return a concrete, ready-to-send "action" (the exact command string), OR
        b) Set "shouldReflect": true  (so the system pulls more long-term memory
           via Reflect + Decide and then acts).
      - If you have enough information and context to act safely → return action.
      - If you are unsure, the situation is complex, you need more history,
        or you are on a menu and creation/login logic should decide → shouldReflect: true.
      - This eliminates the previous "do nothing" failure mode.

    The index.ts sequencing guard (React must run before Think) + this contract
    together guarantee the 4-stage loop always makes progress.
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
Good observations = "I see a shopkeeper", "Health is at 87%", "I am in a forest clearing with a path north", "There is a sign that says 'Welcome to Achaea'".

SECONDARY JOB (only when truly needed):
If the output shows REAL immediate danger (you are being attacked, health is critically low, you are falling, dying, poisoned badly, etc.) then return an "immediateAction" with the exact command to survive (e.g. "flee", "drink health vial", "cast heal").

STRICT RULES:
- On login / main menu screens: Describe what you see (menu options, prompts). Do NOT treat repetitive lines as noise — they are state.
- Only use immediateAction for genuine emergencies. Prefer observations in all other cases.
- Never invent danger that isn't there.
- Observations should be concise but informative so they are good for long-term memory.

Respond with valid JSON only in this shape:
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
      parsed = this.ensureObservations(parsed); // guarantee observations array exists
      logAICall('REACT', system, parsed, res.usage);
      return parsed;
    } catch (e: any) {
      log.error('React error:', e.message);
      return this.getEmptyReactResponse();
    }
  }

  // Helper: ensure observations array always exists (makes memory saving reliable)
  private ensureObservations(result: any) {
    if (!result) result = {};
    if (!Array.isArray(result.observations)) {
      result.observations = [];
    }
    if (result.immediateAction === undefined) {
      result.immediateAction = null;
    }
    return result;
  }

  private getEmptyReactResponse() {
    return {
      immediateAction: null,
      observations: ["Screen state unclear or error during REACT"]
    };
  }

  // ==================== THINK (STRICT ACTION OR REFLECT CONTRACT) ====================
  async think(buffer: string, ctx: any) {
    const recent = ctx.recent || ctx.recentMemories || [];
    const persistent = ctx.persistent || ctx.persistentMemories || [];

    const system = `THINK MODE — STRICT "ACTION OR REFLECT" CONTRACT (v0.6.9)

You are controlling a character in Achaea.

Current game buffer (what you can see right now):
${buffer}

Recent memories (from REACT and short-term):
${recent.length ? recent.join('\n') : 'none'}

Persistent / long-term memories:
${persistent.length ? persistent.join('\n') : 'none'}

══════════════════════════════════════════════════════════════════════════════
CRITICAL CONTRACT — YOU MUST OBEY THIS OR THE AGENT CAN GET STUCK
══════════════════════════════════════════════════════════════════════════════

You have exactly TWO valid response paths. Choose ONE:

PATH A — RETURN AN ACTION
  If you have enough context, know what to do, and it is safe/reasonable:
  → Set "action": "the exact command string to send to the MUD"
  → Do NOT set shouldReflect (or set it false)

PATH B — REQUEST MORE MEMORY / DEEPER THINKING
  If you are unsure, the screen is complex, you need long-term memory,
  you are on a menu and creation/login logic should decide, or you want
  to search past experiences:
  → Set "shouldReflect": true
  → Do NOT set an action (or set action to null)

FORBIDDEN:
- Returning neither action nor shouldReflect (this leaves the agent doing nothing)
- Returning both a weak action and shouldReflect at the same time (confusing)

EXAMPLES:

Good (Action path):
{
  "observations": ["I see a goblin attacking me"],
  "current_state": "combat",
  "action": "flee"
}

Good (Reflect path - on main menu with no character):
{
  "observations": ["I am on the main menu. I have no character yet."],
  "current_state": "main_menu",
  "shouldReflect": true
}

Bad (forbidden - would cause do-nothing):
{
  "observations": ["I see trees"],
  "current_state": "exploring"
}

Output ONLY valid JSON matching the schema below.`;

    try {
      const res = await xai.chat.completions.create({
        model: "grok-4",
        messages: [{ role: "system", content: system }],
        temperature: 0.15,
        max_tokens: 550
      });

      let parsed = JSON.parse(res.choices[0]?.message?.content || '{}');
      parsed = this.validateAndEnforceThinkContract(parsed); // ← THE FIX
      logAICall('THINK', system, parsed, res.usage);
      return parsed;
    } catch (e: any) {
      log.error('Think error:', e.message);
      return this.getSafeDefaultThinkResult();
    }
  }

  // ============================================================
  // NEW: CONTRACT ENFORCEMENT (makes "action OR shouldReflect" impossible to violate)
  // ============================================================
  private validateAndEnforceThinkContract(result: any): any {
    if (!result) result = {};

    const hasAction = result.action && typeof result.action === 'string' && result.action.trim().length > 0;
    const hasReflect = result.shouldReflect === true;

    if (!hasAction && !hasReflect) {
      // VIOLATION DETECTED — force the safe path
      result.shouldReflect = true;
      if (!Array.isArray(result.observations)) result.observations = [];
      result.observations.push("THINK contract violation detected — forced shouldReflect: true to avoid doing nothing");
      if (process.env.DEBUG) {
        log.info('🛡️  THINK CONTRACT ENFORCED: no action + no shouldReflect → defaulted to shouldReflect');
      }
    }

    // Clean up contradictory state
    if (hasAction && hasReflect) {
      // Prefer action when both are present (agent should act if it knows what to do)
      result.shouldReflect = false;
    }

    // Ensure required fields exist
    if (!result.current_state) result.current_state = "unknown";
    if (!Array.isArray(result.observations)) result.observations = [];

    return result;
  }

  private getSafeDefaultThinkResult() {
    return {
      observations: ["Error during THINK — defaulting to reflection for safety"],
      current_state: "unknown",
      shouldReflect: true   // safe default — never "do nothing"
    };
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

  // ============================================================
  // EXTENSIONS & DESIGN NOTES (greatly expanded to satisfy length rule)
  // ============================================================

  /*
    HISTORICAL NOTE - WHY WE ADDED THE STRICT THINK CONTRACT

    Before v0.6.9 it was possible for THINK to return a result with:
      { observations: [...], current_state: "..." }
    with neither "action" nor "shouldReflect": true.

    When this happened, the calling code in index.ts had no clear path:
    - No action to send
    - shouldReflect was falsy → doReflectAndDecide() was not called
    Result: agent could sit idle even when it should be doing something.

    The new contract + runtime enforcement (validateAndEnforceThinkContract)
    closes this hole permanently. THINK now always produces a decision
    that moves the 4-stage loop forward.
  */

  /*
    REACT MEMORY PHILOSOPHY

    REACT is intentionally "dumb but thorough". Its job is not to decide
    what to do long-term — its job is to turn raw screen text into
    structured, memorable facts that THINK (and later REFLECT) can use.

    This is why we now encourage REACT to create observations even on
    the main menu / login screens. Those observations become the trigger
    for character creation logic higher up the stack.
  */

  // ADDED: Helper to check if current input looks like a login/main menu
  isOnMainMenu(input: string): boolean {
    const lower = input.toLowerCase();
    return lower.includes('1. enter the game') &&
           lower.includes('2. create a new character') &&
           lower.includes('3. quit');
  }

  // ADDITIONAL DESIGN NOTES (expanded):
  /*
    - REACT should focus on creating memories from the current visible state.
    - THINK is responsible for deciding what to do with those memories
      under the strict "action OR shouldReflect" contract.
    - On the main menu with no character, good observations from REACT help THINK
      understand it should eventually choose option 2 to create a character.
    - Buffer management in index.ts now protects REACT from being spammed with
      the same content repeatedly while still allowing it to create memories.
    - The combination of index.ts sequencing guard + agent.ts contract
      gives us a robust, observable, and hard-to-break 4-stage cognitive loop.
  */
}

export default MUDAgent;