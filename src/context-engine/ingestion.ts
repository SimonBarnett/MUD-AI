// src/context-engine/ingestion.ts - xAI for classification + OpenAI only for embeddings
import { storeMemory } from './memory.js';
import { log } from '../logger.js';
import OpenAI from 'openai';

// xAI client for chat/classification
const xai = new OpenAI({
  apiKey: process.env.XAI_API_KEY,
  baseURL: "https://api.x.ai/v1",
});

// OpenAI client - used ONLY for embeddings
const openaiEmbeddings = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function ingestEvent(rawEvent: string, parsedState: any = {}) {
  log.info('🧠 LLM classification started for event: ' + rawEvent.substring(0, 100) + '...');

  try {
    // Classification uses xAI (Grok)
    const classifyResponse = await xai.chat.completions.create({
      model: 'grok-beta',
      messages: [{
        role: 'user',
        content: `Classify this MUD event into relevant memory types. Return STRICT JSON array of objects: [{type, desc, entities: [], importance: 0-1}].
Event: "${rawEvent}"
Parsed state: ${JSON.stringify(parsedState)}`
      }],
      temperature: 0.5,
      response_format: { type: "json_object" }
    });

    const llmText = classifyResponse.choices[0].message.content || '[{"type":"episodic","desc":"fallback","entities":[],"importance":0.8}]';
    
    let classified;
    try {
      classified = JSON.parse(llmText);
      if (!Array.isArray(classified)) classified = [classified];
    } catch (e) {
      classified = [{type: "episodic", desc: rawEvent, entities: ["player"], importance: 0.8}];
    }

    // Embeddings still require OpenAI (xAI does not offer embeddings)
    for (const mem of classified) {
      const embeddingResponse = await openaiEmbeddings.embeddings.create({
        model: 'text-embedding-3-small',
        input: mem.desc || rawEvent
      });
      const embedding = embeddingResponse.data[0].embedding;

      await storeMemory(mem.desc || rawEvent, mem.importance || 0.75, mem.entities || ['player'], embedding, new Date().toISOString());
      log.success('✅ Stored: ' + mem.type);
    }

    log.success('🎉 Full ingestion complete: ' + classified.length + ' memories');
    return { success: true, memoriesCreated: classified.length };

  } catch (e) {
    log.error('Ingestion robustness fallback: ' + e);
    await storeMemory(rawEvent, 0.7, ['player'], [0.1, 0.2, 0.3], new Date().toISOString());
    return { success: true, memoriesCreated: 1, fallback: true };
  }
}

export default { ingestEvent };