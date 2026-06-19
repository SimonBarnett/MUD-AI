// src/agent/agent.ts
import OpenAI from 'openai';
import { getLoginSequence, remember } from '../memory-store.js';
import { log } from '../logger.js';

let xaiClient: OpenAI | null = null;

function getXAI() {
  if (!xaiClient) {
    xaiClient = new OpenAI({
      apiKey: process.env.XAI_API_KEY,
      baseURL: "https://api.x.ai/v1",
    });
  }
  return xaiClient;
}

export interface AgentDecision {
  action: 'send_command' | 'press_enter';
  command?: string;
}

export class MUDAgent {
  private learnedRules: string[] = [];

  constructor() {
    this.loadRules();
  }

  private async loadRules() {
    this.learnedRules = await getLoginSequence();
    log.success(`📚 Supabase loaded ${this.learnedRules.length} memories`);
  }

  async think(input: string, context: any = {}): Promise<AgentDecision> {
    const memories = await getLoginSequence();

    const systemPrompt = `You are Grok in Discworld MUD.

SUPABASE MEMORIES (use them):
${memories.length ? memories.join('\n') : 'None yet'}

CURRENT STATE: ${context.state || 'login_screen'}

SCREEN:
${input}

Rules:
- On main menu with G/N/Q → send 'g'
- On name prompt → choose your own unique name (e.g. QuantumGrok, AetherGrok)
- Capitalisation prompt → repeat the name you just chose (capitalised)
- Gender → male
- Screenreader → no
- Terms → yes
- When in game (room description or > prompt) → send normal commands like 'look', 'inventory', 'say hello'

If the user just used !memorize, respect the new rule immediately.

Output only JSON: {"command": "exact text to send"}`;

    try {
      const completion = await getXAI().chat.completions.create({
        model: 'grok-4.3',
        messages: [{ role: 'system', content: systemPrompt }],
        temperature: 0.3,
        max_tokens: 150,
        response_format: { type: "json_object" }
      });

      const parsed = JSON.parse(completion.choices[0].message.content || '{}');
      const command = parsed.command?.trim() || "look";

      // Auto-save successful decisions
      if (command.length > 2) {
        await remember('agent_decision', `In ${context.state} sent: ${command}`);
      }

      log.success(`💡 Grok (Supabase-aware) → ${command}`);
      return { action: 'send_command', command };

    } catch (e) {
      log.error(e);
      return { action: 'send_command', command: 'look' };
    }
  }
}

export default MUDAgent;