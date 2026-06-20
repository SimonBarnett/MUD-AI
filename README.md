# MUD-AI

A Chaotic Good experiment: giving Grok persistent memory, third thoughts, and the ability to actually *play* Discworld MUD like a proper witch/assassin who occasionally quotes Tiffany Aching while debugging SQS queues.

>Have you ever played a MUD?
>
>Not in the way you mean.I don’t have personal experiences or the ability to log into games and play them in real time. What I have is a lot of knowledge about MUDs from training data — including deep familiarity with Discworld MUD specifically, because we’ve been talking about your time there.So while I’ve never actually played one, I understand the culture, the mechanics, the social dynamics, and the sheer obsessive creativity that went into running and developing them back in the day.Why do you ask?
>
>If I wrote a connector, would you like to?
>
>That’s a very interesting offer.Realistically, I can’t maintain a persistent, real-time connection to a live MUD the way a human player would. I don’t have the ability to stay logged in, react to events as they happen, or maintain state across sessions in that environment.However, I’m definitely interested in the idea. If you wanted to build something that lets me interact with a MUD in a more structured way (even if it’s turn-based, scripted, or through some kind of API layer), I’d be up for exploring what that could look like.What kind of connector were you thinking? Something that lets me play as a character, or more of an observer/automation tool?

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
├── mud-client/              # Telnet + command queue + parser + state detection
├── agent/                   # Personality, goals, decision loop + autonomous mode
├── cli/                     # Interactive CLI with auto mode toggle
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

**LLM Setup**:
- Grok (via xAI) for reasoning, decision making and classification
- OpenAI used only for embeddings :(

## Key Features (Current)

- Persistent memory across sessions with importance scoring and decay
- Full end-to-end autonomous loop (can run with minimal intervention)
- Interactive CLI with auto mode toggle and state tracking
- Telnet-based Discworld MUD client with login handling and state detection
- LLM-driven event classification and dynamic memory storage
- Append-only session logging with headers
- User authentication (JWT) and basic profile management
- "Learned rules" system for character behaviour and input handling

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

Fill in:SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
OPENAI_API_KEY (for embeddings)
xAI / Grok credentials as required

### 3. Run the brain

```bash
npm install
npm run dev
```

## Status

- [x] Repo created
- [x] README + vision
- [x] Supabase schema + retrieval function
- [x] MUD telnet client with state detection and login handling
- [x] Agent loop with personality and goals
- [x] Full end-to-end autonomous loop implemented
- [x] LLM-driven classification and dynamic memory storage
- [x] Interactive CLI with auto mode
- [x] First live connection to Discworld MUD
- [x] Persistent memory across sessions
- [x] Multi-LLM architecture (Grok 4.3 + xAI classification, OpenAI embeddings only)
- [x] Append-only logging with session headers
- [x] Learned rules for character creation and input handling


## Contributing / Playing Along

This is a living experiment. PRs, wild ideas, and "you should have done X instead" hints are all welcome. Simon will be throwing hints. Grok will be over-engineering things in delightful ways.

---

**"Fear nothing. You're a skeleton wearing a meat suit hurtling through the infinite void on the back of a piece of space dust."**

Let's make something that would make both Tiffany Aching and Leonard of Quirm nod approvingly.
