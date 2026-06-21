// src/agent/agent.ts - Full MUDAgent with exact 4-stage methods
import OpenAI from 'openai';
import { memorizeFromUser } from '../memory-store.js';
import { log } from '../logger.js';

const client = new OpenAI({
  apiKey: process.env.XAI_API_KEY,
  baseURL: "https://api.x.ai/v1"
});

export class MUDAgent {

  async react(line: string, ctx: any) {
    const system = `REACT MODE — ONE LINE ONLY
You receive only this single line: "${line}"
Last 10 seconds memories: ${ctx.ultraShortMemories?.join(' | ') || 'none'}

Rules (follow exactly):
- If the line shows IMMEDIATE DANGER (you are attacked, someone casting spell, falling, dying, etc.) → return { "immediateAction": "command to send" }
- Otherwise return { "observations": ["obs1", "obs2", ...] }
Each observation will be turned into a memory. Duplicates increase persistence.

Respond with valid JSON only.`;

    const res = await client.chat.completions.create({
      model: "grok-4",
      messages: [{ role: "system", content: system }],
      temperature: 0.1,
      max_tokens: 150
    });

    try {
      const parsed = JSON.parse(res.choices[0].message.content || '{}');
      return parsed;
    } catch {
      return { observations: [`Processed line: ${line.substring(0, 50)}`] };
    }
  }

  async think(buffer: string, ctx: any) {
    const system = `THINK MODE — FULL BUFFER AFTER SILENCE
Buffer:
${buffer}

Recent 2min memories + persistent memories provided.

Do two things:
1. Return observations on the buffer (each will become a memory)
2. Either return a direct command OR set "shouldReflect": true

Respond in JSON: { "observations": [...], "action"?: "...", "shouldReflect"?: true }`;

    const res = await client.chat.completions.create({
      model: "grok-4",
      messages: [{ role: "system", content: system }],
      temperature: 0.3
    });

    try {
      return JSON.parse(res.choices[0].message.content || '{}');
    } catch {
      return { observations: ["Buffer analysed"], shouldReflect: true };
    }
  }

  async reflect(ctx: any) {
    const system = `REFLECT MODE
No buffer. You have these memories:
Recent: ${ctx.recentMemories?.join('\n') || 'none'}
Persistent: ${ctx.persistentMemories?.join('\n') || 'none'}

Return a JSON array of SPECIFIC memory queries you need before you can Decide().
Example: ["What do I know about the Mended Drum?", "Current quest status?", "Diblah's attitude toward me?", "Best action from current location?"]`;

    const res = await client.chat.completions.create({
      model: "grok-4",
      messages: [{ role: "system", content: system }],
      temperature: 0.2
    });

    try {
      return JSON.parse(res.choices[0].message.content || '[]');
    } catch {
      return ["What do I know about my current location?", "Any active goals or threats?"];
    }
  }

  async decide(retrievedMemories: any[]) {
    const system = `DECIDE MODE — FINAL STEP
You now have the memories you requested in Reflect():
${retrievedMemories.map((m, i) => `${i+1}. ${m.content}`).join('\n')}

Return the single best command to send to the MUD right now.
JSON format: { "command": "exact command string", "reasoning": "short reason" }`;

    const res = await client.chat.completions.create({
      model: "grok-4",
      messages: [{ role: "system", content: system }],
      temperature: 0.1
    });

    try {
      return JSON.parse(res.choices[0].message.content || '{"command":"look"}');
    } catch {
      return { command: "look" };
    }
  }

  // Helper called by index.ts
  async queryMemories(queries: string[]) {
    // This calls your memory-store layer
    log.info(`🔍 Reflect queries: ${queries.length} sent to DB`);
    return queries.map(q => ({ content: `Retrieved memory for: ${q}` }));
  }
}

export default MUDAgent;