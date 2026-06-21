// src/context-engine/memory.ts - Vector Embeddings + Semantic Search
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
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
        global: {
          headers: {
            'X-Client-Info': 'mud-ai-memory',
          },
        },
        realtime: {
          transport: ws,
        },
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
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return openai;
}

// ==================== Types ====================

export interface Memory {
  id?: string;
  content: string;
  importance?: number;
  entities?: string[];
  embedding?: number[];
  created_at?: string;
  updated_at?: string;
}

// ==================== Embedding Generation ====================

async function generateEmbedding(text: string): Promise<number[]> {
  const openaiClient = getOpenAI();

  const response = await openaiClient.embeddings.create({
    model: "text-embedding-3-small", // 1536 dimensions - good balance of quality and cost
    input: text.replace(/\n/g, " "),
    encoding_format: "float",
  });

  return response.data[0].embedding;
}

// ==================== Memory Functions ====================

/**
 * Store a new memory.
 * Automatically generates vector embedding if none is provided.
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

  // Auto-generate embedding if not provided
  if (!finalEmbedding) {
    try {
      finalEmbedding = await generateEmbedding(content);
    } catch (err) {
      console.error('Failed to generate embedding for memory:', err);
      // Continue without embedding (graceful fallback)
      finalEmbedding = undefined;
    }
  }

  const { error } = await supabaseClient
    .from('grok_mud_memories')
    .insert({
      content,
      importance,
      entities,
      embedding: finalEmbedding,
      created_at: timestamp || new Date().toISOString(),
    });

  if (error) {
    console.error('Failed to store memory:', error);
    throw error;
  }
}

/**
 * Update an existing memory by ID
 */
export async function updateMemory(id: string, updates: Partial<Memory>): Promise<void> {
  const supabaseClient = getSupabase();

  const { error } = await supabaseClient
    .from('grok_mud_memories')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) {
    console.error('Failed to update memory:', error);
    throw error;
  }
}

/**
 * Delete a memory by ID
 */
export async function deleteMemory(id: string): Promise<void> {
  const supabaseClient = getSupabase();

  const { error } = await supabaseClient
    .from('grok_mud_memories')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Failed to delete memory:', error);
    throw error;
  }
}

/**
 * Get a single memory by ID
 */
export async function getMemoryById(id: string): Promise<Memory | null> {
  const supabaseClient = getSupabase();

  const { data, error } = await supabaseClient
    .from('grok_mud_memories')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error('Failed to get memory by ID:', error);
    return null;
  }

  return data as Memory;
}

/**
 * Get recent memories (no vector search)
 */
export async function getRecentMemories(limit: number = 10): Promise<Memory[]> {
  const supabaseClient = getSupabase();

  const { data, error } = await supabaseClient
    .from('grok_mud_memories')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Failed to get recent memories:', error);
    return [];
  }

  return (data as Memory[]) || [];
}

/**
 * Semantic vector search using embeddings (recommended)
 */
export async function searchSimilarMemories(
  query: string,
  limit: number = 10,
  threshold: number = 0.72
): Promise<Memory[]> {
  const supabaseClient = getSupabase();

  try {
    const queryEmbedding = await generateEmbedding(query);

    const { data, error } = await supabaseClient.rpc('match_memories', {
      query_embedding: queryEmbedding,
      match_threshold: threshold,
      match_count: limit,
    });

    if (error) {
      console.error('Vector search (match_memories) failed:', error);
      return [];
    }

    return (data as Memory[]) || [];
  } catch (err) {
    console.error('Error in searchSimilarMemories:', err);
    return [];
  }
}

/**
 * Hybrid search: tries vector search first, falls back to text search
 */
export async function searchMemories(query: string, limit: number = 10): Promise<Memory[]> {
  // Try semantic vector search first
  const vectorResults = await searchSimilarMemories(query, limit);

  if (vectorResults.length > 0) {
    return vectorResults;
  }

  // Fallback to simple text search
  const supabaseClient = getSupabase();

  const { data, error } = await supabaseClient
    .from('grok_mud_memories')
    .select('*')
    .ilike('content', `%${query}%`)
    .order('importance', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Text search fallback failed:', error);
    return [];
  }

  return (data as Memory[]) || [];
}

export default {
  storeMemory,
  updateMemory,
  deleteMemory,
  getMemoryById,
  getRecentMemories,
  searchMemories,
  searchSimilarMemories,
};