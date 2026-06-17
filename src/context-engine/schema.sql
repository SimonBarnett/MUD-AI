-- MUD-AI Context Engine Schema
-- Run this after enabling the vector extension in your Supabase project

CREATE EXTENSION IF NOT EXISTS vector;

-- Core memories table
CREATE TABLE IF NOT EXISTS grok_mud_memories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),

    memory_type TEXT NOT NULL 
        CHECK (memory_type IN ('episodic', 'relational', 'factual', 'procedural', 'emotional', 'lore')),
    
    content TEXT NOT NULL,
    
    importance FLOAT DEFAULT 0.5 
        CHECK (importance BETWEEN 0 AND 1),
    
    -- Automatic recency + importance decay score (higher = more relevant)
    recency_boost FLOAT GENERATED ALWAYS AS (
        importance * EXP(-EXTRACT(EPOCH FROM (now() - created_at)) / 86400.0)
    ) STORED,

    entities TEXT[] DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    embedding VECTOR(1536)  -- text-embedding-3-small
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_memories_hnsw 
    ON grok_mud_memories 
    USING hnsw (embedding vector_ip_ops);

CREATE INDEX IF NOT EXISTS idx_memories_type 
    ON grok_mud_memories (memory_type);

CREATE INDEX IF NOT EXISTS idx_memories_entities 
    ON grok_mud_memories USING gin (entities);

CREATE INDEX IF NOT EXISTS idx_memories_metadata 
    ON grok_mud_memories USING gin (metadata jsonb_path_ops);

CREATE INDEX IF NOT EXISTS idx_memories_importance 
    ON grok_mud_memories (importance DESC);

-- Auto-update timestamp trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS trigger_memories_updated_at ON grok_mud_memories;
CREATE TRIGGER trigger_memories_updated_at
    BEFORE UPDATE ON grok_mud_memories
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- The main retrieval function (multi-stage, entity-aware, importance + recency boosted)
CREATE OR REPLACE FUNCTION match_mud_memories(
    query_embedding vector(1536),
    match_threshold float DEFAULT 0.78,
    match_count int DEFAULT 12,
    current_entities text[] DEFAULT '{}'
)
RETURNS TABLE (
    id uuid,
    content text,
    similarity float,
    memory_type text,
    importance float,
    recency_boost float,
    entities text[]
)
LANGUAGE sql STABLE
AS $$
    SELECT
        id,
        content,
        1 - (embedding <=> query_embedding) AS similarity,
        memory_type,
        importance,
        recency_boost,
        entities
    FROM grok_mud_memories
    WHERE 
        embedding <=> query_embedding < match_threshold
        AND (
            current_entities = '{}' 
            OR entities && current_entities
        )
    ORDER BY 
        (importance * (1 - (embedding <=> query_embedding))) DESC,
        created_at DESC
    LIMIT match_count;
$$;

COMMENT ON TABLE grok_mud_memories IS 'Persistent memory store for MUD-AI agent with importance, entity awareness, and vector search';
