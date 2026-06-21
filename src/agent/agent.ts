// src/agent/agent.ts - v0.6.1 — React → Think → Reflect → Decide (context-engine)
import 'dotenv/config';
import OpenAI from 'openai';
import { searchMemories } from '../context-engine/memory.js';
import { log } from '../logger.js';

// xAI Grok client (for all reasoning)
const xai = new OpenAI({
  apiKey: process.env.XAI_API_KEY,
  baseURL: "https://api.x.ai/v1"
});

// OpenAI client (only for embeddings - we'll use it later)
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export class MUDAgent {

  // ==================== REACT ====================
  async react(line: string, ctx: any) {
    const ultraShort = ctx.ultraShort || ctx.ultraShortMemories || [];

    const system = `REACT MODE — ONE LINE ONLY
You receive only this single line: "${line}"
Last 10 seconds memories: ${ultraShort.length ? ultraShort.join(' | ') : 'none'}

Rules:
- If IMMEDIATE DANGER (attacked, spell on you, falling, dying, very low health) → return { "immediateAction": "command" }
- Otherwise return { "observations": ["obs1", "obs2"] }

Respond with valid JSON only.`;

    try {
      const res = await xai.chat.completions.create({
        model: "grok-4",
        messages: [{ role: "system", content: system }],
        temperature: 0.1,
        max_tokens: 160
      });

      const content = res.choices[0]?.message?.content || '{}';
      return JSON.parse(content);
    } catch (e: any) {
      log.error('React error:', e.message);
      return { observations: [`Processed: ${line.substring(0, 60)}`] };
    }
  }

  // ==================== THINK ====================
  async think(buffer: string, ctx: any) {
    const recent = ctx.recent || ctx.recentMemories || [];
    const persistent = ctx.persistent || ctx.persistentMemories || [];

    const system = `THINK MODE
Game buffer after silence:
${buffer}

Recent memories:
${recent.length ? recent.join('\n') : 'none'}

Persistent memories:
${persistent.length ? persistent.join('\n') : 'none'}

Return JSON:
{
  "observations": ["obs1", "obs2"],
  "action"?: "command to send",
  "shouldReflect"?: true
}`;

    try {
      const res = await xai.chat.completions.create({
        model: "grok-4",
        messages: [{ role: "system", content: system }],
        temperature: 0.25,
        max_tokens: 450
      });

      const content = res.choices[0]?.message?.content || '{}';
      return JSON.parse(content);
    } catch (e: any) {
      log.error('Think error:', e.message);
      return { observations: ["Buffer analysed"], shouldReflect: true };
    }
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

Return a JSON array of 4-7 specific memory queries you need.
Example: ["What do I know about the Mended Drum?", "Current quest status?"]`;

    try {
      const res = await xai.chat.completions.create({
        model: "grok-4",
        messages: [{ role: "system", content: system }],
        temperature: 0.2,
        max_tokens: 300
      });

      const content = res.choices[0]?.message?.content || '[]';
      return JSON.parse(content);
    } catch (e: any) {
      log.error('Reflect error:', e.message);
      return ["What do I know about my current location?", "Any active goals or threats?"];
    }
  }

  // ==================== DECIDE ====================
  async decide(retrievedMemories: any[], extra?: any) {
    const memoriesText = retrievedMemories
      .map((m, i) => `${i + 1}. ${m.content || m}`)
      .join('\n');

    const system = `DECIDE MODE — FINAL ACTION
Fresh memories from Reflect:
${memoriesText || 'No memories retrieved'}

Return JSON: { "command": "exact command", "reasoning": "short reason" }`;

    try {
      const res = await xai.chat.completions.create({
        model: "grok-4",
        messages: [{ role: "system", content: system }],
        temperature: 0.1,
        max_tokens: 120
      });

      const content = res.choices[0]?.message?.content || '{"command":"look"}';
      return JSON.parse(content);
    } catch (e: any) {
      log.error('Decide error:', e.message);
      return { command: "look", reasoning: "Fallback" };
    }
  }

  // ==================== REAL MEMORY QUERY (using context-engine) ====================
  async queryMemories(queries: string[]) {
    log.info(`🔍 Searching memories for ${queries.length} queries`);

    try {
      const results = await Promise.all(
        queries.map(query => searchMemories(query, 5))
      );
      // Flatten and deduplicate results
      const flat = results.flat();
      const unique = Array.from(new Map(flat.map(m => [m.id, m])).values());
      return unique;
    } catch (e: any) {
      log.error('queryMemories error:', e.message);
      return [];
    }
  }
}

export default MUDAgent;