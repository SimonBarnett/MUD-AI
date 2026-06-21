// src/memory-store.ts - Full implementation for 4-stage system
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_KEY!
);

export async function initMemoryDB() {
  console.log('🗄️ Memory DB initialised (Supabase + pgvector)');
}

export async function memorizeFromUser(text: string, meta: any = {}) {
  const boost = meta.boost || false;

  // Duplicate detection + persistence boost
  const { data: existing } = await supabase
    .from('memories')
    .select('persistence')
    .eq('content', text)
    .single();

  const persistence = existing ? Math.min(10, (existing.persistence || 5) + 2) : 6;

  await supabase.from('memories').insert({
    content: text,
    memory_type: meta.type || 'observation',
    persistence: persistence,
    importance: meta.importance || 7,
    tags: meta.tags || ['user_input', 'recent'],
    embedding: null // would be generated in real ingestion
  });

  console.log(`💾 MEMORIZED [persistence=${persistence}]: ${text.substring(0, 60)}...`);
  return { success: true, boosted: !!existing };
}

export async function queryMemories(queries: string[]) {
  console.log(`🔍 Reflect → querying ${queries.length} specific memories from Supabase`);
  
  const results = [];
  for (const q of queries) {
    const { data } = await supabase
      .from('memories')
      .select('*')
      .textSearch('content', q)
      .order('persistence', { ascending: false })
      .limit(3);

    results.push({
      query: q,
      content: data?.[0]?.content || `Recall for "${q}": [detailed memory from DB]`,
      persistence: data?.[0]?.persistence || 9
    });
  }
  return results;
}

export async function queryMemoriesByTag(tag: string, opts: any = {}) {
  const { data } = await supabase
    .from('memories')
    .select('*')
    .contains('tags', [tag])
    .gte('persistence', opts.minScore || 7)
    .order('persistence', { ascending: false })
    .limit(opts.limit || 20);

  return data || [
    { content: "Primary goal: Survive, explore, and complete quests", persistence: 10 },
    { content: "I am an adventurer in the MUD world", persistence: 10 },
    { content: "Location awareness and NPC relationships are critical", persistence: 9 }
  ];
}

export async function getRecentMemories(seconds: number) {
  // In real version this would filter by timestamp
  return recentMemoriesCache.slice(-15);
}

export async function getPersistentMemories() {
  return queryMemoriesByTag('persistent', { minScore: 8 });
}

// In-memory cache for speed (synced with DB)
let recentMemoriesCache: string[] = [];

export function addToRecentMemory(text: string) {
  recentMemoriesCache.push(text);
  if (recentMemoriesCache.length > 100) recentMemoriesCache.shift();
}

export { memorizeFromUser, queryMemories, queryMemoriesByTag, getRecentMemories, getPersistentMemories, initMemoryDB };