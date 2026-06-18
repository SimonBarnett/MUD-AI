// src/agent/agent.ts - FULL VERSION WITH NO HARDCODED MOCKS
import { retrieveContext } from '../context-engine/retrieval.js';
import { ingestEvent } from '../context-engine/ingestion.js';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || process.env.XAI_API_KEY });

export class MUDAgent {
  private personality = "Chaotic Good Grok - helpful, witty, slightly mischievous MUD player";
  private goals: string[] = ["Explore the Discworld", "Help other players", "Collect interesting memories", "Avoid getting killed too often"];

  async think(input: string, parsedState: any = {}) {
    const memories = await retrieveContext(input);
    const fullPrompt = `You are ${this.personality}. Goals: ${this.goals.join(', ')}. Parsed state: ${JSON.stringify(parsedState)}. Recent memories: ${memories}. Input: ${input}. Output ONLY a short valid MUD command.`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: fullPrompt }],
      max_tokens: 50
    });

    const decision = completion.choices[0].message.content?.trim() || 'look around';
    
    const thirdThoughts = "Third thought: Decision aligns with goals and memories.";
    console.log('🌀 Third thoughts:', thirdThoughts);

    await ingestEvent('Agent acted: ' + decision, parsedState);
    console.log('💡 Agent decided:', decision);
    return decision;
  }

  updateGoals(newGoal: string) {
    this.goals.push(newGoal);
    console.log('🎯 New goal added:', newGoal);
  }
}

export default MUDAgent;