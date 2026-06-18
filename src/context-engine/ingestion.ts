// ====================== src/context-engine/ingestion.ts ======================
import { storeMemory } from './memory.js';
import { log } from '../logger.js';
import OpenAI from 'openai';

// ====================== SILENT LOGGER ======================
const silentLogger = {
  error: () => {},
  warn: () => {},
  info: () => {},
  debug: () => {}
};

// ====================== CLIENT FACTORIES ======================
let xaiClient: OpenAI | null = null;
let embeddingsClient: OpenAI | null = null;

function getXAI() {
  if (!xaiClient) {
    xaiClient = new OpenAI({
      apiKey: process.env.XAI_API_KEY,
      baseURL: "https://api.x.ai/v1",
      logger: silentLogger,
      logLevel: 'error'
    });
  }
  return xaiClient;
}

function getEmbeddingsClient() {
  if (!embeddingsClient) {
    embeddingsClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      logger: silentLogger,
      logLevel: 'error'
    });
  }
  return embeddingsClient;
}

// ====================== MAIN INGEST FUNCTION ======================
export async function ingestEvent(rawEvent: string, parsedState: any = {}) {
  log.info('🧠 LLM classification started for event: ' + rawEvent.substring(0, 80) + '...');

  try {
    const classify = await getXAI().chat.completions.create({
      model: 'grok-4.3',
      messages: [{
        role: 'user',
        content: `Classify this MUD event. Return JSON array: [{type, desc, entities: [], importance: 0-1}]. Event: "${rawEvent}"`
      }],
      temperature: 0.5,
      response_format: { type: "json_object" }
    });

    const text = classify.choices[0].message.content || `[{"type":"episodic","desc":"${rawEvent}","entities":["player"],"importance":0.8}]`;
    
    let classified: any[] = [];
    try {
      classified = JSON.parse(text);
      if (!Array.isArray(classified)) classified = [classified];
    } catch {
      classified = [{ type: "episodic", desc: rawEvent, entities: ["player"], importance: 0.8 }];
    }

    for (const mem of classified) {
      const embeddingResponse = await getEmbeddingsClient().embeddings.create({
        model: 'text-embedding-3-small',
        input: mem.desc || rawEvent
      });

      await storeMemory(
        mem.desc || rawEvent,                    // Always goes to `content` column
        mem.importance || 0.8,
        mem.entities || [],                      // ← Clean: always pass array (never forces ['player'])
        embeddingResponse.data[0].embedding,
        new Date().toISOString()
      );

      log.success('✅ Stored: ' + (mem.type || 'memory'));
    }

    log.success('🎉 Ingestion complete: ' + classified.length + ' memories');
    return { success: true, count: classified.length };

  } catch (e: any) {
    log.error('Ingestion error: ' + (e?.message || e));
    return { success: false };
  }
}

export default { ingestEvent };