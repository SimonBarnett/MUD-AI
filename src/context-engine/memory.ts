// src/context-engine/memory.ts - FULL VERSION WITH LAZY SUPABASE CLIENT
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
      process.env.SUPABASE_SERVICE_ROLE_KEY
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

// ==================== Memory Functions ====================

export interface Memory {
  id?: string;
  content: string;
  importance?: number;
  entities?: string[];
  embedding?: number[];
  created_at?: string;
  updated_at?: string;
}

/**
 * Store a new memory in the database
 */
export async function storeMemory(
  content: string,
  importance: number = 0.8,
  entities: string[] = [],
  embedding?: number[],
  timestamp?: string
): Promise<void> {
  const supabaseClient = getSupabase();

  const { error } = await supabaseClient
    .from('grok_mud_memories')
    .insert({
      content,
      importance,
      entities,
      embedding,
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
    console.error('Failed to get memory:', error);
    return null;
  }

  return data as Memory;
}

/**
 * Get recent memories (useful for context)
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
 * Search memories by content (simple text search)
 */
export async function searchMemories(query: string, limit: number = 10): Promise<Memory[]> {
  const supabaseClient = getSupabase();

  const { data, error } = await supabaseClient
    .from('grok_mud_memories')
    .select('*')
    .ilike('content', `%${query}%`)
    .order('importance', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Failed to search memories:', error);
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
};