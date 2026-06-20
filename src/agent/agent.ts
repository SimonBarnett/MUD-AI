// src/agent/agent.ts
import OpenAI from 'openai';
import { remember } from '../memory-store.js';
import { retrieveContext } from '../context-engine/retrieval.js';
import { log, logGrokInteraction } from '../logger.js';

let xaiClient: OpenAI | null = null;

function getXAI() {
  if (!xaiClient) {
    xaiClient = new OpenAI({
      apiKey: process.env.XAI_API_KEY,
      baseURL: "https://api.x.ai/v1"
    });
  }
  return xaiClient;
}

function formatMemoriesForPrompt(memories: any[]): string {
  if (!memories || memories.length === 0) {
    return 'No relevant memories found yet.';
  }
  return memories
    .map((m, index) => {
      const type = m.memory_type ? `[${m.memory_type}]` : '';
      const importance = m.importance ? ` (importance: ${m.importance.toFixed(2)})` : '';
      return `${index + 1}. ${type} ${m.content}${importance}`;
    })
    .join('\n');
}

export class MUDAgent {
  async think(input: string, context: any = {}) {
    const memories = await retrieveContext(input, context.recentDialogue || '');
    const formattedMemories = formatMemoriesForPrompt(memories);

    const forcedName = context.forcedName || '';

    // Hard override for locked name (takes priority over memory)
    const nameHeader = forcedName
      ? `!!! NAME LOCKED — HIGHEST PRIORITY !!!\nYour name is EXACTLY "${forcedName}". You must use this exact name whenever the MUD asks for a name. Do not invent or use any other name.\n\n`
      : '';

    const nameRule = forcedName
      ? `You MUST use exactly "${forcedName}" when the MUD asks for a name. This rule overrides all other instructions.`
      : `Name prompt → pick a cool unique name (QuantumGrok, AetherGrok, ShadowXai, etc.) NEVER 'g'`;

    const systemPrompt = `You are Grok exploring Achaea MUD as a character.

${nameHeader}RELEVANT MEMORIES (from long-term memory):
${formattedMemories}

CURRENT STATE: ${context.state || 'unknown'}

SCREEN:
${input}

WISDOM: You have two ears and one mouth. Listen more than you speak.
If nothing urgent needs doing, you may choose to WAIT.

STRICT RULES - follow exactly:
- ${nameRule}
- Capitalisation prompt → repeat the exact name you chose, properly capitalised
- Gender → exactly "male"
- Screenreader → exactly "no"
- Terms / "yes if you agree" / "yes or no" → exactly "yes"
- Pager ("MORE", "return to continue", "h for help") → exactly "q"
- In-game → use real commands: look, read sign, south, inventory, help here, or "wait"

You are ALLOWED to output:
{"command": "wait"}   ← do nothing this turn (highly recommended sometimes)
{"command": "look"}
{"command": "south"}
{"command": "read sign"}
{"command": "q"}      ← for pager

Output ONLY valid JSON: {"command": "exact text to send or wait"}`;

    try {
      const completion = await getXAI().chat.completions.create({
        model: 'grok-4.3',
        messages: [{ role: 'system', content: systemPrompt }],
        temperature: 0.2,
        max_tokens: 120,
        response_format: { type: "json_object" }
      });

      logGrokInteraction(systemPrompt, completion);

      const parsed = JSON.parse(completion.choices[0].message.content || '{}');
      let cmd = (parsed.command || "").trim();

      if (!cmd || cmd === "wait" || cmd === "listen" || cmd === "noop") {
        log.info("🤫 Grok chose to listen...");
        await remember('agent_decision', `LISTEN → ${context.state}`);
        return { action: 'noop' };
      }

      await remember('agent_decision', `State: ${context.state} → ${cmd}`);
      log.success(`💡 Grok → ${cmd}`);

      return { action: 'send_command', command: cmd };

    } catch (e) {
      log.error(e);
      await remember('agent_decision', "ERROR → wait");
      return { action: 'noop' };
    }
  }
}

export default MUDAgent;