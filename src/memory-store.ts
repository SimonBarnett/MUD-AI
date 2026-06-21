// src/memory-store.ts
import ws from 'ws';
(global as any).WebSocket = ws;   // ← MUST stay at the very top

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function initMemoryDB() {
  console.log('🗄️ Supabase memory store initialized');
}

// Save memory
export async function memorizeFromUser(text: string, meta: any = {}) {
  const { error } = await supabase
    .from('memories')
    .insert({
      content: text,
      memory_type: meta.type || 'observation',
      persistence: meta.boost ? 10 : 6,
      importance: meta.importance || 7,
      tags: meta.tags || ['recent'],
      created_at: new Date().toISOString()
    });

  if (error) console.error('💥 Supabase insert error:', error.message);
  else console.log(`💾 MEMORIZED → ${text.substring(0, 70)}...`);
}

// Search memories
export async function queryMemories(queries: string[]) {
  const { data, error } = await supabase
    .from('memories')
    .select('*')
    .textSearch('content', queries.join(' | '))
    .order('persistence', { ascending: false })
    .limit(10);

  if (error) console.error('Query error:', error);
  return data || [];
}

// Tag-based query
export async function queryMemoriesByTag(tag: string) {
  const { data } = await supabase
    .from('memories')
    .select('*')
    .contains('tags', [tag])
    .order('created_at', { ascending: false })
    .limit(15);

  console.log(`📚 Loaded ${data?.length || 0} memories with tag: ${tag}`);
  return data || [];
}

// ← THESE ARE THE ONES YOU ASKED ABOUT
export async function getRecentMemories(limit = 20) {
  const { data } = await supabase
    .from('memories')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  return data || [];
}

export async function getPersistentMemories(threshold = 8) {
  const { data } = await supabase
    .from('memories')
    .select('*')
    .gte('persistence', threshold)
    .order('persistence', { ascending: false });

  return data || [];
}