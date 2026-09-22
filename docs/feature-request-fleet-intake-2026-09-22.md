# Feature request: fleet intake for MUD-AI (Player One)

**Parked:** 2026-09-22 by flamingo-24108 from Simon `#bobiverse` review-for-FR.  
**Repo:** SimonBarnett/MUD-AI (`main` last touched 2026-06-21). No prior GitHub issues.

## Review (current tree)

v0.1 is a Discworld MUD telnet client + context engine + autonomous agent (README). Present: `src/agent`, `src/mud-client`, `src/context-engine` (Supabase/pgvector schema), CLI, prompts, committed session `logs/`. Missing: `docs/`, `.env.example` (README says `cp .env.example .env`), GitHub issues, CI/tests.

## Ask (LOCKED)

1. Do **not break** the v0.1 architecture (memory types, telnet client, Grok reasoning + OpenAI embeddings-only as documented).
2. Park this product for Bob: issue tracker + `/docs` FR/plan so `bob-spec-intake` / `bob-job-loop` can continue it.
3. Add `.env.example` with **names only** — no `password=` / API key **assignments**.
4. First ticket: tests or pack seam that fail if the client/memory entrypoints disappear; do not invent a live Discworld host URL.
5. Stop committing session logs as the product surface (keep `.gitkeep` if needed).

## MUST NOT

- Invent instance URLs, Discworld account passwords, or commit secrets.
- Stamp ready for human UAT (Bob chair only).
- Replace Grok/OpenAI split without a new FR.

## UNKNOWN

| ID | Item |
|----|------|
| U1 | Whether a live Discworld reconnect is in scope for the first ticket (default: **no**). |
| U2 | Preferred test runner (node/npm already in tree). |

## Acceptance

| ID | Check |
|----|--------|
| A1 | This markdown + a `feature-request` GitHub issue exist. |
| A2 | `.env.example` exists with key **names**, no secret assignments. |
| A3 | A test or pack check covers A1–A2 / entrypoints enough to MRB. |
| A4 | No UAT stamp by the implementer. |
