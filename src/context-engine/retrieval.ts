// src/context-engine/retrieval.ts - OpenAI used ONLY for embeddings
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

const supabase: SupabaseClient = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// OpenAI client - used ONLY for embeddings (xAI does not offer embeddings yet)
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface RetrievedMemory {
  id: string;
  content: string;
  similarity: number;
  memory_type: string;
  importance: number;
  recency_boost: number;
  entities: string[];
}

export async function retrieveContext(
  currentScene: string,
  recentDialogue: string,
  options: {
    topK?: number;
    threshold?: number;
    currentEntities?: string[];
  } = {}
): Promise<RetrievedMemory[]> {
  const {
    topK = 12,
    threshold = 0.78,
    currentEntities = [],
  } = options;

  const queryText = `${currentScene}\n${recentDialogue}`.slice(0, 8000);

  // Generate query embedding using OpenAI
  const embeddingResponse = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: queryText,
  });

  const queryEmbedding = embeddingResponse.data[0].embedding;

  const { data, error } = await supabase.rpc('match_mud_memories', {
    query_embedding: queryEmbedding,
    match_threshold: threshold,
    match_count: topK,
    current_entities: currentEntities,
  });

  if (error) {
    console.error('Retrieval error:', error);
    return [];
  }

  return (data as RetrievedMemory[]) || [];
}

export async function getRelevantMemories(
  scene: string,
  dialogue: string,
  entities: string[] = []
): Promise<RetrievedMemory[]> {
  return retrieveContext(scene, dialogue, {
    currentEntities: entities,
    topK: 10,
  });
}