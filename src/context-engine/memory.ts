import { createClient, SupabaseClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

const supabase: SupabaseClient = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export type MemoryType =
  | 'episodic'
  | 'relational'
  | 'factual'
  | 'procedural'
  | 'emotional'
  | 'lore';

export interface StoreMemoryOptions {
  type: MemoryType;
  content: string;
  importance?: number;           // 0.0 - 1.0
  entities?: string[];
  metadata?: Record<string, any>;
}

/**
 * Store a new memory in the persistent store
 */
export async function storeMemory(options: StoreMemoryOptions): Promise<void> {
  const { type, content, importance = 0.7, entities = [], metadata = {} } = options;

  // Generate embedding
  const embeddingResponse = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: content,
  });

  const embedding = embeddingResponse.data[0].embedding;

  const { error } = await supabase
    .from('grok_mud_memories')
    .insert({
      memory_type: type,
      content,
      importance,
      entities,
      metadata,
      embedding,
    });

  if (error) {
    console.error('Failed to store memory:', error);
    throw error;
  }
}

/**
 * Update importance or metadata of an existing memory
 */
export async function updateMemoryImportance(
  id: string,
  newImportance: number
): Promise<void> {
  const { error } = await supabase
    .from('grok_mud_memories')
    .update({ importance: newImportance })
    .eq('id', id);

  if (error) throw error;
}
