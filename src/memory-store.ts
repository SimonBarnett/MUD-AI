import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';
import ws from 'ws';

(global as any).WebSocket = ws;

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    realtime: { params: {}, transport: ws as any },
    auth: { persistSession: false }
  }
);

export async function initMemoryDB() {
  console.log('📦 Connected to Supabase (with ws polyfill)');
  await supabase.from('mud_memories').select('id').limit(1);
}

/**
 * Simple persistent logging / user-injected memories
 */
export async function remember(key: string, value: string) {
  const { error } = await supabase
    .from('mud_memories')
    .insert([{ key, value, timestamp: new Date().toISOString() }]);

  if (error) console.error('Supabase insert error:', error);
}

export async function memorizeFromUser(text: string) {
  await remember('user_injected', text);
}

/**
 * Legacy - kept only for backward compatibility
 */
export async function getLoginSequence(): Promise<string[]> {
  const { data } = await supabase
    .from('mud_memories')
    .select('key, value')
    .or('key.like.%login%,key.eq.user_injected')
    .order('timestamp', { ascending: true });

  return data?.map(r => r.value) || [];
}