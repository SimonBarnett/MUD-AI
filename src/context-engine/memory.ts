// src/context-engine/memory.ts - v0.6.31-aggressive-dedup
import ws from 'ws';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

let supabase: SupabaseClient | null = null;
let openai: OpenAI | null = null;

function getSupabase(): SupabaseClient {
  if (!supabase) {
    supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { 'X-Client-Info': 'mud-ai-memory' } },
      realtime: { transport: ws },
    });
  }
  return supabase;
}

function getOpenAI(): OpenAI {
  if (!openai) openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return openai;
}

export interface Memory {
  id?: string;
  content: string;
  importance?: number;
  entities?: string[];
  embedding?: number[];
  memory_type?: 'fact' | 'goal';
  created_at?: string;
  updated_at?: string;
}

function normalizeForComparison(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b(the|a|an|is|are|was|were|be|been|being|have|has|had|do|does|did|will|would|could|should|may|might|must|shall|can|to|of|in|on|at|for|with|by)\b/g, '')
    .trim();
}

async function generateEmbedding(text: string): Promise<number[]> {
  const res = await getOpenAI().embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
    dimensions: 1536,
  });
  return res.data[0].embedding;
}

export async function smartMemorize(content: string, importance = 0.7, memoryType: 'fact' | 'goal' = 'fact'): Promise<void> {
  const client = getSupabase();
  const normalized = normalizeForComparison(content);

  if (memoryType === 'goal') {
    const embedding = await generateEmbedding(content);
    await client.from('grok_mud_memories').insert({
      content,
      importance: Math.max(importance, 0.93),
      embedding,
      memory_type: 'goal',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    return;
  }

  try {
    const embedding = await generateEmbedding(content);
    const { data: similar } = await client.rpc('match_memories', {
      query_embedding: embedding,
      match_threshold: 0.76,
      match_count: 10,
    });

    if (similar?.length) {
      for (const mem of similar) {
        if (normalizeForComparison(mem.content) === normalized || (mem.similarity && mem.similarity > 0.76)) {
          const newImp = Math.min((mem.importance || 0.5) + 0.2, 1.0);
          await client.from('grok_mud_memories').update({
            importance: newImp,
            updated_at: new Date().toISOString(),
          }).eq('id', mem.id);
          return;
        }
      }
    }

    await client.from('grok_mud_memories').insert({
      content,
      importance,
      embedding,
      memory_type: 'fact',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  } catch (e) {
    console.error('smartMemorize error:', e);
  }
}

export async function storeGoal(goalContent: string): Promise<void> {
  const prefixed = goalContent.startsWith('[GOAL]') ? goalContent : `[GOAL] ${goalContent}`;
  await smartMemorize(prefixed, 0.95, 'goal');
}

export async function clearCompletedGoal(goalDescription: string): Promise<void> {
  await getSupabase().from('grok_mud_memories')
    .delete()
    .ilike('content', `%${goalDescription}%`)
    .eq('memory_type', 'goal');
}

export async function getRecentMemories(limit = 12): Promise<Memory[]> {
  const { data } = await getSupabase().from('grok_mud_memories')
    .select('*').order('created_at', { ascending: false }).limit(limit);
  return data || [];
}

export async function searchMemories(query: string, limit = 8): Promise<Memory[]> {
  const vector = await searchSimilarMemories(query, limit);
  return vector.length ? vector : [];
}

export async function searchSimilarMemories(query: string, limit = 8, threshold = 0.75) {
  const emb = await generateEmbedding(query);
  const { data } = await getSupabase().rpc('match_memories', {
    query_embedding: emb,
    match_threshold: threshold,
    match_count: limit,
  });
  return data || [];
}

export default { smartMemorize, storeGoal, clearCompletedGoal, getRecentMemories, searchMemories };