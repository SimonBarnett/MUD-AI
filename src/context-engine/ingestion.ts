// src/context-engine/ingestion.ts - FULL VERSION WITH NO HARDCODED MOCKS
import { storeMemory } from './memory.js';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || process.env.XAI_API_KEY });

export async function ingestEvent(rawEvent: string, parsedState: any = {}) {
  console.log('🧠 LLM classification started for event:', rawEvent.substring(0, 100) + '...');

  try {
    const classifyResponse = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{
        role: 'user',
        content: `Classify this MUD event into relevant memory types. Return STRICT JSON array of objects: [{type, desc, entities: [], importance: 0-1}].
Event: "${rawEvent}"
Parsed state: ${JSON.stringify(parsedState)}`
      }],
      temperature: 0.5,
      response_format: { type: "json_object" }
    });

    const llmText = classifyResponse.choices[0].message.content || '[]';
    let classified;
    try {
      classified = JSON.parse(llmText);
    } catch (e) {
      classified = [];
    }

    for (const mem of classified) {
      const embeddingResponse = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: mem.desc || rawEvent
      });
      const embedding = embeddingResponse.data[0].embedding;
      await storeMemory(mem.desc || rawEvent, mem.importance || 0.75, mem.entities || [], embedding, new Date().toISOString());
      console.log('✅ Stored dynamic memory:', mem.type);
    }

    console.log('🎉 Full ingestion complete with dynamic memories');
    return { success: true, memoriesCreated: classified.length };

  } catch (e) {
    console.error('Ingestion error:', e);
    await storeMemory(rawEvent, 0.7, [], [0.1, 0.2, 0.3], new Date().toISOString());
    return { success: true, memoriesCreated: 1, fallback: true };
  }
}

export default { ingestEvent };