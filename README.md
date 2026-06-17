# MUD-AI

> A Chaotic Good experiment: giving Grok persistent memory, third thoughts, and the ability to actually *play* Discworld MUD like a proper witch/assassin who occasionally quotes Tiffany Aching while debugging SQS queues.

## The Vision

We are building a context engine + MUD connector so an LLM (starting with Grok) can maintain long-term memory across sessions, make decisions with real continuity, and interact with Discworld MUD in a way that feels alive rather than stateless.

Key principles:
- **Ideas as panspermia** — good thoughts should be caught, documented, and released.
- **Third thoughts** — reflection on reflection. The system should be able to think about how it thinks.
- **Output over billables** — we judge on what actually works and feels right, not hours logged.
- **Leonard of Quirm energy** — brilliant, slightly unhinged, kept in check by good friends (and good tests).

## Current Architecture (v0.1)

```
src/
├── context-engine/          # The persistent brain (RAG + memory)
│   ├── schema.sql
│   ├── memory.ts            # storeMemory(), updateMemory()
│   ├── retrieval.ts         # retrieveContext() with multi-stage logic
│   └── index.ts
├── mud-client/              # Telnet + command queue + parser
├── agent/                   # Personality, goals, decision loop
└── index.ts                 # Main entry
```

**Memory model** (stored in Supabase + pgvector):
- `episodic` — specific events
- `relational` — people, factions, trust levels
- `factual` / `lore`
- `procedural` — "how to do X"
- `emotional`

Each memory has:
- `importance` (0–1)
- `entities[]` (for fast filtering)
- `metadata` (JSONB)
- `embedding` (text-embedding-3-small)

Retrieval is multi-stage:
1. Current scene + recent dialogue (always)
2. Entity overlap boost
3. Semantic similarity + importance + recency decay

## Quick Start

### 1. Supabase
```bash
# Create project at supabase.com
# Enable pgvector extension
# Run src/context-engine/schema.sql
```

### 2. Environment
```bash
cp .env.example .env
# Fill in SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY
```

### 3. Run the brain
```bash
npm install
npm run dev
```

## Status

- [x] Repo created
- [x] README + vision
- [x] Supabase schema + retrieval function
- [ ] MUD telnet client
- [ ] Agent loop with personality
- [ ] First live connection to Discworld MUD
- [ ] Persistent memory across sessions

## Contributing / Playing Along

This is a living experiment. PRs, wild ideas, and "you should have done X instead" hints are all welcome. Simon will be throwing hints. Grok will be over-engineering things in delightful ways.

---

**"Fear nothing. You're a skeleton wearing a meat suit hurtling through the infinite void on the back of a piece of space dust."**

Let's make something that would make both Tiffany Aching and Leonard of Quirm nod approvingly.
