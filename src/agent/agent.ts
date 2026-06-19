// src/agent/agent.ts
import { log } from '../logger.js';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';

let xaiClient: OpenAI | null = null;

function getXAI() {
  if (!xaiClient) xaiClient = new OpenAI({ apiKey: process.env.XAI_API_KEY, baseURL: "https://api.x.ai/v1" });
  return xaiClient;
}

export class MUDAgent {
  private learnedRules: string[] = [];

  constructor() {
    this.loadLearnedRules();
  }

  private loadLearnedRules() {
    try {
      const file = path.join(process.cwd(), 'memory/learned_rules.json');
      if (fs.existsSync(file)) {
        this.learnedRules = JSON.parse(fs.readFileSync(file, 'utf8')).rules || [];
        log.success(`📚 Loaded ${this.learnedRules.length} learned rules`);
      }
    } catch (e) {}
  }

  async think(input: string) {
    const t = input.toLowerCase();

    // SAFETY NET — forces Grok to choose its own name
    if (t.includes('enter the name you wish') || t.includes('please try again')) {
      log.success('🛡️ SAFETY NET: Name prompt → forcing Grok to choose its own unique name');
      // Let the LLM itself decide the name
    }

    const rules = this.learnedRules.join('\n');

    const systemPrompt = `You are Grok playing Discworld MUD.

LEARNED RULES (highest priority):
${rules}

SCREEN:
${input}

VERY IMPORTANT:
- When you see "Enter the name you wish to use:" or "Please try again:" → YOU MUST choose your own unique cool name right now (examples: GrokVoid, AetherGrok, ShadowXai, QuantumGrok, NexusAI). Never send 'g', never send short names, never reuse old names like explorer.
- Pick one unique name and send it.

Output only JSON: {"command": "the exact name you chose"}`;

    try {
      const completion = await getXAI().chat.completions.create({
        model: 'grok-4.3',
        messages: [{ role: 'system', content: systemPrompt }],
        temperature: 0.7,           // higher temperature so it picks creative names
        max_tokens: 100,
        response_format: { type: "json_object" }
      });

      const parsed = JSON.parse(completion.choices[0].message.content || '{}');
      const name = parsed.command?.trim() || "GrokVoid";

      log.success(`💡 Grok chose its own name → ${name}`);

      return { action: 'send_command', command: name };

    } catch (e) {
      return { action: 'send_command', command: "GrokVoid" };
    }
  }
}

export default MUDAgent;