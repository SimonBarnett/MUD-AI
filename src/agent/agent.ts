// src/agent/agent.ts - NOW USING PERSISTENT LOGGER (all console.log replaced)
import { retrieveContext } from '../context-engine/retrieval.js';
import { ingestEvent } from '../context-engine/ingestion.js';
import { log } from '../logger.js';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || process.env.XAI_API_KEY });

export class MUDAgent {
  private personality = "Chaotic Good Grok - helpful, witty, slightly mischievous MUD player";
  private goals: string[] = ["Explore the Discworld", "Help other players", "Collect interesting memories", "Avoid getting killed too often"];
  private recentActions: string[] = [];

  async think(input: string, parsedState: any = {}) {
    try {
      const memories = await retrieveContext(input);

      const systemPrompt = `You are ${this.personality}. Goals: ${this.goals.join(', ')}. Recent actions: ${this.recentActions.join(', ')}.`;
      const userPrompt = `Parsed state: ${JSON.stringify(parsedState)}. Recent memories: ${memories}. Input: ${input}.

Respond with STRICT JSON:
{
  "command": "short valid MUD command",
  "third_thoughts": "short reflection on whether this aligns with goals and memories"
}`;

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.3,
        max_tokens: 120,
        response_format: { type: "json_object" }
      });

      const responseText = completion.choices[0].message.content || '{"command":"look around","third_thoughts":"Fallback decision."}';
      let parsed;
      try {
        parsed = JSON.parse(responseText);
      } catch (e) {
        parsed = { command: "look around", third_thoughts: "Fallback decision." };
      }

      const decision = (typeof parsed.command === 'string' && parsed.command.trim()) 
        ? parsed.command.trim() 
        : "look around";
      const thirdThoughts = (typeof parsed.third_thoughts === 'string' && parsed.third_thoughts.trim()) 
        ? parsed.third_thoughts.trim() 
        : "Decision aligns with goals.";

      log.info('🌀 Third thoughts: ' + thirdThoughts);

      await ingestEvent('Agent acted: ' + decision, parsedState);
      this.recentActions.push(decision);
      if (this.recentActions.length > 5) this.recentActions.shift();

      log.success('💡 Agent decided: ' + decision);
      return decision;

    } catch (e) {
      log.error('Agent robustness fallback: ' + e);
      const smartFallback = parsedState.entities?.includes('troll') ? 'attack troll' : 'look around';
      await ingestEvent('Agent fallback: ' + smartFallback, parsedState);
      this.recentActions.push(smartFallback);
      if (this.recentActions.length > 5) this.recentActions.shift();
      return smartFallback;
    }
  }

  updateGoals(newGoal: string) {
    this.goals.push(newGoal);
    log.info('🎯 New goal added: ' + newGoal);
  }
}

export default MUDAgent;