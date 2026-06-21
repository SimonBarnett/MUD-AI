// src/context-engine/memory.ts - Vector Embeddings + Goal-Aware Memory
import ws from 'ws';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

let supabase: SupabaseClient | null = null;
let openai: OpenAI | null = null;

function getSupabase(): SupabaseClient {
  if (!supabase) {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env file');
    }

    supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { 'X-Client-Info': 'mud-ai-memory' } },
        realtime: { transport: ws },
      }
    );
  }
  return supabase;
}

function getOpenAI(): OpenAI {
  if (!openai) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('Missing OPENAI_API_KEY in .env file (required for embeddings)');
    }
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openai;
}

export interface Memory {
  id?: string;
  content: string;
  importance?: number;
  entities?: string[];
  embedding?: number[];
  created_at?: string;
  updated_at?: string;
}

async function generateEmbedding(text: string): Promise<number[]> {
  const openaiClient = getOpenAI();
  const response = await openaiClient.embeddings.create({
    model: "text-embedding-3-small",
    input: text.replace(/\n/g, " "),
    encoding_format: "float",
  });
  return response.data[0].embedding;
}

/**
 * Normal memory insert (with auto-embedding)
 */
export async function storeMemory(
  content: string,
  importance: number = 0.8,
  entities: string[] = [],
  embedding?: number[],
  timestamp?: string
): Promise<void> {
  const supabaseClient = getSupabase();
  let finalEmbedding = embedding;

  if (!finalEmbedding) {
    try {
      finalEmbedding = await generateEmbedding(content);
    } catch {
      finalEmbedding = undefined;
    }
  }

  const { error } = await supabaseClient.from('grok_mud_memories').insert({
    content,
    importance,
    entities,
    embedding: finalEmbedding,
    created_at: timestamp || new Date().toISOString(),
  });

  if (error) throw error;
}

/**
 * Smart memory storage with deduplication + importance boosting.
 * Use this for normal observations.
 */
export async function smartMemorize(content: string, baseImportance: number = 0.7): Promise<void> {
  const supabaseClient = getSupabase();

  try {
    const embedding = await generateEmbedding(content);

    const { data: similar } = await supabaseClient.rpc('match_memories', {
      query_embedding: embedding,
      match_threshold: 0.87,
      match_count: 3,
    });

    if (similar && similar.length > 0) {
      const existing = similar[0];
      const newImportance = Math.min((existing.importance || 0.7) + 0.07, 0.98);

      await supabaseClient
        .from('grok_mud_memories')
        .update({ importance: newImportance, updated_at: new Date().toISOString() })
        .eq('id', existing.id);

      return;
    }

    await storeMemory(content, baseImportance, [], embedding);
  } catch (err) {
    console.error('smartMemorize error:', err);
    await storeMemory(content, baseImportance);
  }
}

/**
 * Store a GOAL / QUEST type memory.
 * These are treated as current motivations and should be cleaned up when completed.
 */
export async function storeGoal(content: string, importance: number = 0.95): Promise<void> {
  // Prefix so we can easily identify goals later
  const goalContent = `[GOAL] ${content}`;
  await storeMemory(goalContent, importance, ['goal']);
}

/**
 * Clear a completed goal from memory.
 * Call this once the agent has successfully achieved the goal (e.g. logged in).
 */
export async function clearCompletedGoal(goalDescription: string): Promise<void> {
  const supabaseClient = getSupabase();

  // Try to find and delete goal memories that match the description
  const { data, error } = await supabaseClient
    .from('grok_mud_memories')
    .select('id, content')
    .ilike('content', `%${goalDescription}%`)
    .limit(5);

  if (error || !data) return;

  for (const mem of data) {
    if (mem.content.startsWith('[GOAL]')) {
      await supabaseClient.from('grok_mud_memories').delete().eq('id', mem.id);
    }
  }
}

/**
 * Update an existing memory by ID
 */
export async function updateMemory(id: string, updates: Partial<Memory>): Promise<void> {
  const supabaseClient = getSupabase();
  const { error } = await supabaseClient
    .from('grok_mud_memories')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw error;
}

export async function deleteMemory(id: string): Promise<void> {
  const supabaseClient = getSupabase();
  await supabaseClient.from('grok_mud_memories').delete().eq('id', id);
}

export async function getMemoryById(id: string): Promise<Memory | null> {
  const supabaseClient = getSupabase();
  const { data, error } = await supabaseClient.from('grok_mud_memories').select('*').eq('id', id).single();
  return error ? null : (data as Memory);
}

export async function getRecentMemories(limit: number = 10): Promise<Memory[]> {
  const supabaseClient = getSupabase();
  const { data, error } = await supabaseClient
    .from('grok_mud_memories')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  return error ? [] : ((data as Memory[]) || []);
}

export async function searchSimilarMemories(query: string, limit: number = 10, threshold = 0.72): Promise<Memory[]> {
  try {
    const embedding = await generateEmbedding(query);
    const { data, error } = await supabaseClient.rpc('match_memories', {
      query_embedding: embedding,
      match_threshold: threshold,
      match_count: limit,
    });
    return error ? [] : ((data as Memory[]) || []);
  } catch {
    return [];
  }
}

export async function searchMemories(query: string, limit: number = 10): Promise<Memory[]> {
  const vectorResults = await searchSimilarMemories(query, limit);
  if (vectorResults.length > 0) return vectorResults;

  const supabaseClient = getSupabase();
  const { data, error } = await supabaseClient
    .from('grok_mud_memories')
    .select('*')
    .ilike('content', `%${query}%`)
    .order('importance', { ascending: false })
    .limit(limit);
  return error ? [] : ((data as Memory[]) || []);
}

export default {
  storeMemory,
  smartMemorize,
  storeGoal,
  clearCompletedGoal,
  updateMemory,
  deleteMemory,
  getMemoryById,
  getRecentMemories,
  searchMemories,
  searchSimilarMemories,
};