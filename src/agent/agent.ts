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

export interface AgentDecision {
  action: 'send_command' | 'press_enter';
  command?: string;
  third_thoughts?: string;
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

  async think(input: string, parsedState: any = {}): Promise<AgentDecision> {
    try {
      const memories = await retrieveContext(input);
      const currentState = parsedState.state || 'unknown';

      const systemPrompt = `You are ${this.personality}.
Your current goals: ${this.goals.join(' | ')}
Recent actions: ${this.recentActions.slice(-6).join(' → ')}
Recent reflections: ${this.recentReflections.slice(-3).join(' | ')}

CURRENT STATE: ${currentState}

You must respond with STRICT JSON in this format:
{
  "action": "send_command" | "press_enter",
  "command": "short valid input (only include if action is send_command)",
  "third_thoughts": "1-2 sentence reflection on whether this aligns with your goals"
}

STATE-SPECIFIC RULES (FOLLOW THESE STRICTLY):

- If state === "login_menu": 
    You MUST type "G" (for Guest character). This is the fastest and preferred way to enter the game.
    Do NOT use "press_enter". Do NOT use "look". Just type "G".

- If state === "character_prompt":
    Type a simple guest name like "groktest" or "explorer".

- If state === "press_enter":
    Use action: "press_enter"

- If state === "in_game":
    Use normal MUD commands (look, movement, examine, etc).

- Never use "look" or exploration commands while on any login or character selection screen.

GENERAL RULES:
- Keep commands short (1-6 words ideal).
- Never output free text outside the JSON.`;

      const userPrompt = `Current situation: ${JSON.stringify(parsedState)}
Recent memories: ${memories}
What just happened: ${input}

Respond with the JSON object above.`;

      const completion = await getXAI().chat.completions.create({
        model: 'grok-4.3',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.4,
        max_tokens: 180,
        response_format: { type: "json_object" }
      });

      const responseText = completion.choices[0].message.content || '{"action":"press_enter","third_thoughts":"Need more information."}';
      
      let parsed: any;
      try {
        parsed = JSON.parse(responseText);
      } catch {
        parsed = { action: "press_enter", third_thoughts: "Fallback decision." };
      }

      const action = parsed.action === 'press_enter' ? 'press_enter' : 'send_command';
      let command = (typeof parsed.command === 'string') ? parsed.command.trim() : '';
      const thirdThoughts = (typeof parsed.third_thoughts === 'string') ? parsed.third_thoughts.trim() : "Decision made.";

      // Improved state-aware fallback
      if (action === 'send_command' && !isPlausibleCommand(command)) {
        log.hint('Agent produced questionable command → using state-aware fallback');

        if (currentState === 'login_menu') {
          command = 'g';
        } else if (currentState === 'character_prompt') {
          command = 'groktest';
        } else {
          command = parsedState.entities?.length > 0 
            ? `examine ${parsedState.entities[0]}` 
            : "look";
        }
      }

      this.recentReflections.push(thirdThoughts);
      if (this.recentReflections.length > 6) this.recentReflections.shift();

      log.info('🌀 Third thoughts: ' + thirdThoughts);

      const finalDecision = action === 'press_enter' ? '[press enter]' : command;
      await ingestEvent('Agent acted: ' + finalDecision, parsedState);

      this.recentActions.push(finalDecision);
      if (this.recentActions.length > 8) this.recentActions.shift();

      log.success('💡 Agent decided: ' + finalDecision);

      return {
        action,
        command: action === 'send_command' ? command : undefined,
        third_thoughts: thirdThoughts
      };

    } catch (e) {
      log.error('Agent robustness fallback: ' + e);
      return {
        action: 'press_enter',
        third_thoughts: 'Used safe fallback due to error.'
      };
    }
  }

  updateGoals(newGoal: string) {
    this.goals.push(newGoal);
    log.info('🎯 New goal added: ' + newGoal);
  }
}

export default MUDAgent;