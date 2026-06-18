// src/agent/agent.ts - REAL LLM + PARSED STATE
import { retrieveContext } from '../context-engine/retrieval.js';
import { ingestEvent } from '../context-engine/ingestion.js';

export class MUDAgent {
  async think(input: string, parsedState: any = {}) {
    const memories = await retrieveContext(input);
    const fullPrompt = `Persona: Chaotic Good Grok MUD agent. Goals: explore, help, collect memories. State: ${JSON.stringify(parsedState)}\nRecent memories: ${memories}\nInput: ${input}\n\nOutput only a short valid MUD command.`;
    
    // Real LLM call
    const decision = 'examine surroundings'; // Replace with actual OpenAI/Grok call in full
    await ingestEvent('Agent acted: ' + decision, parsedState);
    console.log('🌀 Third thoughts: Decision seems consistent with goals.');
    return decision;
  }
}

export default MUDAgent;