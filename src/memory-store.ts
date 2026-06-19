// src/memory-store.ts
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

export async function initMemoryDB() {
  console.log('📦 Connected to Supabase memory store');
  // Optional: create table if not exists (run once)
  await supabase.from('mud_memories').upsert({ key: 'init', value: 'ready' });
}

export async function remember(key: string, value: string) {
  const { error } = await supabase
    .from('mud_memories')
    .insert([{ key, value, timestamp: new Date().toISOString() }]);

  if (!error) console.log(`💾 Supabase memory saved → ${key}`);
}

export async function getLoginSequence(): Promise<string[]> {
  const { data } = await supabase
    .from('mud_memories')
    .select('value')
    .like('key', '%login%')
    .order('timestamp', { ascending: true });

  return data?.map(r => r.value) || [];
}

// Bonus: Dynamic memorize from CLI
export async function memorizeFromUser(text: string) {
  await remember('user_injected', text);
  return `💾 Saved to Supabase: ${text}`;
}