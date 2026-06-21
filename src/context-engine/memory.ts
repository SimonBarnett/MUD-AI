// src/context-engine/memory.ts - v0.6.30-clean-schema
// Vector Embeddings + Semantic Search + STRONG ANTI-DUPLICATION
// Compatible with clean grok_mud_memories schema (id, content, embedding, created_at, updated_at, entities, importance, memory_type)
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

// ==================== Types ====================
export interface Memory {
  id?: string;
  content: string;
  importance?: number;
  entities?: string[];
  embedding?: number[];
  created_at?: string;
  updated_at?: string;
  memory_type?: 'fact' | 'goal';
}

// ==================== Helpers ====================

/**
 * Normalize text for better duplicate detection.
 * This prevents REACT from creating near-identical memories with slight rewording.
 */
function normalizeForComparison(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function generateEmbedding(text: string): Promise<number[]> {
  const openaiClient = getOpenAI();
  const response = await openaiClient.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
    dimensions: 1536,
  });
  return response.data[0].embedding;
}

// ==================== Core Memory Functions ====================

/**
 * SMART MEMORIZE — Facts with strong anti-duplication + Goals
 *
 * - Normalizes text before vector comparison
 * - Uses 0.82 similarity threshold for facts
 * - Near-duplicates → boost importance instead of inserting again
 * - Goals are never deduplicated (they are unique active motivations)
 */
export async function smartMemorize(
  content: string,
  importance: number = 0.7,
  memoryType: 'fact' | 'goal' = 'fact'
): Promise<void> {
  const supabaseClient = getSupabase();
  const normalized = normalizeForComparison(content);

  try {
    // === GOAL PATH (never deduplicate) ===
    if (memoryType === 'goal') {
      const embedding = await generateEmbedding(content);
      const { error } = await supabaseClient.from('grok_mud_memories').insert({
        content,
        importance: Math.max(importance, 0.9),
        embedding,
        memory_type: 'goal',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      if (error) console.error('Failed to store goal:', error);
      return;
    }

    // === FACT PATH (with deduplication) ===
    const queryEmbedding = await generateEmbedding(content);

    const { data: similar, error: searchError } = await supabaseClient.rpc('match_memories', {
      query_embedding: queryEmbedding,
      match_threshold: 0.82,
      match_count: 5,
    });

    if (searchError) {
      console.error('Vector search failed in smartMemorize:', searchError);
    }

    if (similar && similar.length > 0) {
      for (const mem of similar) {
        const existingNormalized = normalizeForComparison(mem.content);
        const isVerySimilar =
          existingNormalized === normalized ||
          (mem.similarity && mem.similarity > 0.82);

        if (isVerySimilar) {
          const newImportance = Math.min((mem.importance || 0.5) + 0.15, 1.0);
          await supabaseClient
            .from('grok_mud_memories')
            .update({
              importance: newImportance,
              updated_at: new Date().toISOString(),
            })
            .eq('id', mem.id);

          console.log(`[smartMemorize] Boosted importance of near-duplicate (id=${mem.id})`);
          return;
        }
      }
    }

    // No duplicate found → insert new memory
    const embedding = await generateEmbedding(content);
    const { error: insertError } = await supabaseClient.from('grok_mud_memories').insert({
      content,
      importance,
      embedding,
      memory_type: 'fact',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    if (insertError) console.error('Failed to insert memory:', insertError);
  } catch (err) {
    console.error('smartMemorize error:', err);
  }
}

/**
 * Store a high-priority goal (login, creation, quest, etc.)
 * Goals are never auto-deduplicated.
 */
export async function storeGoal(goalContent: string): Promise<void> {
  const prefixed = goalContent.startsWith('[GOAL]') ? goalContent : `[GOAL] ${goalContent}`;
  await smartMemorize(prefixed, 0.95, 'goal');
}

/**
 * Clear a completed goal so it stops influencing future THINK cycles.
 */
export async function clearCompletedGoal(goalDescription: string): Promise<void> {
  const supabaseClient = getSupabase();
  const { error } = await supabaseClient
    .from('grok_mud_memories')
    .delete()
    .ilike('content', `%${goalDescription}%`)
    .eq('memory_type', 'goal');

  if (error) {
    console.error('Failed to clear goal:', error);
  } else {
    console.log(`[memory] Cleared completed goal containing: ${goalDescription}`);
  }
}

// ==================== Legacy + Utility Functions ====================

export async function storeMemory(content: string, importance: number = 0.7) {
  await smartMemorize(content, importance, 'fact');
}

export async function updateMemory(id: string, updates: Partial<Memory>) {
  const supabaseClient = getSupabase();
  const { error } = await supabaseClient
    .from('grok_mud_memories')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) console.error('Failed to update memory:', error);
}

export async function deleteMemory(id: string) {
  const supabaseClient = getSupabase();
  const { error } = await supabaseClient.from('grok_mud_memories').delete().eq('id', id);
  if (error) console.error('Failed to delete memory:', error);
}

export async function getMemoryById(id: string): Promise<Memory | null> {
  const supabaseClient = getSupabase();
  const { data, error } = await supabaseClient
    .from('grok_mud_memories')
    .select('*')
    .eq('id', id)
    .single();
  return error ? null : (data as Memory);
}

export async function getRecentMemories(limit: number = 15): Promise<Memory[]> {
  const supabaseClient = getSupabase();
  const { data, error } = await supabaseClient
    .from('grok_mud_memories')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  return error ? [] : ((data as Memory[]) || []);
}

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
  smartMemorize,
  storeGoal,
  clearCompletedGoal,
  storeMemory,
  updateMemory,
  deleteMemory,
  getMemoryById,
  getRecentMemories,
  searchMemories,
  searchSimilarMemories,
};