// src/context-engine/retrieval.ts - LAZY Supabase client (fixes env loading issue)
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

let supabase: SupabaseClient | null = null;
let openai: OpenAI | null = null;

function getSupabase() {
  if (!supabase) {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
    }
    supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  }
  return supabase;
}

function getOpenAIForEmbeddings() {
  if (!openai) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('Missing OPENAI_API_KEY in .env (needed for embeddings)');
    }
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return openai;
}

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

  const embeddingResponse = await getOpenAIForEmbeddings().embeddings.create({
    model: 'text-embedding-3-small',
    input: queryText,
  });

  const queryEmbedding = embeddingResponse.data[0].embedding;

  const { data, error } = await getSupabase().rpc('match_mud_memories', {
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