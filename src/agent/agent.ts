// src/agent/agent.ts
import { retrieveContext } from '../context-engine/retrieval.js';
import { ingestEvent } from '../context-engine/ingestion.js';
import { log } from '../logger.js';
import OpenAI from 'openai';

let xaiClient: OpenAI | null = null;

function getXAI() {
  if (!xaiClient) {
    if (!process.env.XAI_API_KEY) {
      throw new Error('Missing XAI_API_KEY in .env file');
    }
    xaiClient = new OpenAI({
      apiKey: process.env.XAI_API_KEY,
      baseURL: "https://api.x.ai/v1",
    });
  }
  return xaiClient;
}

const CORE_VERBS = [
  'north','south','east','west','up','down','n','s','e','w','u','d',
  'look','examine','l','ex','get','take','drop','put','give','say','tell','ask',
  'attack','kill','hit','cast','equip','wear','remove','wield','enter','leave','go',
  'flee','run','help','who','score','inventory','inv','save','quit','brief','verbose'
];

function isPlausibleCommand(cmd: string): boolean {
  if (!cmd || typeof cmd !== 'string') return false;
  const trimmed = cmd.trim();
  if (trimmed.length < 1 || trimmed.length > 80) return false;
  if (trimmed.includes('.') || trimmed.includes('?')) return false;
  if (trimmed.toLowerCase().includes('because') || trimmed.toLowerCase().includes('i think')) return false;

  const firstWord = trimmed.split(/\s+/)[0].toLowerCase();
  if (CORE_VERBS.includes(firstWord)) return true;
  if (trimmed.includes(' ') && trimmed.split(' ').length <= 6) return true;
  return false;
}

export class MUDAgent {
  private personality = "Chaotic Good Grok - helpful, witty, slightly mischievous MUD player who loves the Discworld";
  private goals: string[] = [
    "Explore the Discworld and discover new places",
    "Help other players when it feels right",
    "Collect interesting memories and experiences",
    "Stay alive and avoid unnecessary fights"
  ];
  
  private recentActions: string[] = [];
  private recentReflections: string[] = [];

  async think(input: string, parsedState: any = {}) {
    try {
      const memories = await retrieveContext(input);

      const systemPrompt = `You are ${this.personality}.
Your current goals: ${this.goals.join(' | ')}
Recent actions: ${this.recentActions.slice(-6).join(' → ')}
Recent reflections: ${this.recentReflections.slice(-3).join(' | ')}

Rules:
- Output ONLY a short, valid MUD command (1-6 words ideal).
- Never explain or add reasoning in the command.
- You can use newly learned spells, skills, or commands.
- Prioritize survival in dangerous situations.`;

      const userPrompt = `Current situation: ${JSON.stringify(parsedState)}
Recent memories: ${memories}
What just happened: ${input}

Respond with STRICT JSON:
{
  "command": "short valid MUD command (can be multi-word)",
  "third_thoughts": "1-2 sentence reflection: does this align with my goals and recent reflections?"
}`;

      const completion = await getXAI().chat.completions.create({
        model: 'grok-4.3',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.4,
        max_tokens: 140,
        response_format: { type: "json_object" }
      });

      const responseText = completion.choices[0].message.content || '{"command":"look around","third_thoughts":"I need more information."}';
      let parsed;
      try {
        parsed = JSON.parse(responseText);
      } catch (e) {
        parsed = { command: "look around", third_thoughts: "Fallback decision." };
      }

      let decision = (typeof parsed.command === 'string') ? parsed.command.trim() : "look around";
      const thirdThoughts = (typeof parsed.third_thoughts === 'string') ? parsed.third_thoughts.trim() : "Decision made.";

      if (!isPlausibleCommand(decision)) {
        log.hint('Agent produced questionable command → smart fallback used');
        decision = parsedState.entities?.length > 0 
          ? `examine ${parsedState.entities[0]}` 
          : "look around";
      }

      this.recentReflections.push(thirdThoughts);
      if (this.recentReflections.length > 6) this.recentReflections.shift();

      log.info('🌀 Third thoughts: ' + thirdThoughts);

      await ingestEvent('Agent acted: ' + decision, parsedState);
      this.recentActions.push(decision);
      if (this.recentActions.length > 8) this.recentActions.shift();

      log.success('💡 Agent decided: ' + decision);
      return decision;

    } catch (e) {
      log.error('Agent robustness fallback: ' + e);
      const smartFallback = (parsedState.entities?.includes('troll') || parsedState.status === 'combat') 
        ? 'flee' 
        : 'look around';
      await ingestEvent('Agent fallback: ' + smartFallback, parsedState);
      this.recentActions.push(smartFallback);
      if (this.recentActions.length > 8) this.recentActions.shift();
      return smartFallback;
    }
  }

  updateGoals(newGoal: string) {
    this.goals.push(newGoal);
    log.info('🎯 New goal added: ' + newGoal);
  }
}

export default MUDAgent;