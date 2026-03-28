# Architecture Overview

## System Diagram

```
                    ┌──────────────────┐
                    │  Client / Agent  │
                    │  (HTTP / Plugin) │
                    └────────┬─────────┘
                             │
                             v
                    ┌──────────────────┐
                    │  mem0-stack-oss  │
                    │  (FastAPI)       │
                    │                  │
                    │  AsyncMemory SDK │
                    └──┬─────┬─────┬──┘
                       │     │     │
              ┌────────┘     │     └────────┐
              v              v              v
     ┌──────────────┐ ┌───────────┐ ┌─────────────────┐
     │  PostgreSQL   │ │ FalkorDB  │ │ OpenAI-compat   │
     │  + pgvector   │ │ or Neo4j  │ │ LLM API         │
     │              │ │           │ │                 │
     │ Vector store │ │ Graph     │ │ Fact extraction │
     │ + metadata   │ │ memory    │ │ Classification  │
     └──────────────┘ └───────────┘ └─────────────────┘

     ┌──────────────────────────┐
     │  Dashboard (React SPA)   │──── GET/POST ───> mem0-stack-oss API
     └──────────────────────────┘

     ┌──────────────────────────┐
     │  OpenClaw Gateway        │
     │  + openclaw-mem0 plugin  │──── HTTP ────────> mem0-stack-oss API
     └──────────────────────────┘
```

## Request Flow

### Adding a memory (`POST /memories`)

```
Client sends messages + user_id
    │
    v
API validates request
    │
    v
AsyncMemory.add() ──> LLM extracts facts from conversation
    │                      │
    │                      v
    │                  Facts stored in pgvector (embedding + metadata)
    │                      │
    │                      v
    │                  Graph entities extracted and stored in FalkorDB
    │
    v
Response returned immediately (memory IDs)
    │
    v
Background task: classify + verify + store classification
```

### Searching memories (`POST /search`)

```
Client sends query + user_id
    │
    v
AsyncMemory.search() ──> Query embedded via embedder
    │                         │
    │                         v
    │                     pgvector similarity search
    │                         │
    │                         v
    │                     (Optional) Reranker rescores results
    │
    v
Results returned with scores and metadata
```

### Combined recall (`POST /search/recall`)

```
Client sends query + user_id + optional run_id
    │
    v
Two parallel searches:
    ├── Long-term search (user_id)
    └── Session search (run_id, if provided)
    │
    v
UNION results, deduplicate
    │
    v
(Optional) Reranker rescores combined results
    │
    v
Top-K results returned
```

## Classification Pipeline

Every memory added goes through a background classification pipeline:

```
Memory created
    │
    v
[1] Classify ── LLM assigns category + subcategory + confidence
    │
    v
[2] Verify (optional) ── second LLM confirms or corrects
    │
    v
[3] Store ── classification metadata saved to memory payload
```

- **Stage 1 (Classify)**: Uses the classification prompt template with the taxonomy to assign a category, subcategory, and confidence level (high/medium/low).
- **Stage 2 (Verify)**: Optional. A different LLM (can be a different provider, e.g. Anthropic) verifies the classification. Enable with `VERIFY_ENABLED=true`.
- **Stage 3 (Store)**: The final classification is written to the memory's metadata in PostgreSQL.

## Memory Lifecycle

```
Add ──> Classify ──> Available for search/recall
                         │
                         ├── Decay (importance score decreases over time)
                         ├── Dedup (semantically similar memories merged)
                         ├── Feedback (users flag bad memories)
                         │       └── very_negative → auto-suppressed
                         └── Cleanup (expired + low-importance removed)
```

Maintenance operations are triggered via the `/maintenance/*` endpoints:

| Endpoint | What it does |
|----------|-------------|
| `/maintenance/decay` | Applies exponential decay to importance scores based on age |
| `/maintenance/dedup` | Finds semantically similar memories and merges them |
| `/maintenance/cleanup-expired` | Removes memories below importance threshold or past TTL |

These are designed to be called on a schedule (e.g. daily cron job).

## Component Descriptions

### AsyncMemory SDK

The server uses the async variant of the mem0 SDK (`AsyncMemory`). This provides non-blocking I/O for all database and LLM operations, initialized via FastAPI's lifespan context manager for clean startup and shutdown.

### pgvector (PostgreSQL)

Stores memory embeddings and metadata. Each memory is a row containing:
- Vector embedding (for similarity search)
- Memory text
- Entity identifiers (user_id, agent_id, run_id)
- Classification metadata (category, subcategory, confidence)
- Importance score (for decay)
- Timestamps (created, updated)
- Source conversation (original messages)
- Feedback data

### FalkorDB / Neo4j

Stores entity relationships extracted from conversations as a knowledge graph. Each user gets an isolated graph namespace. FalkorDB is the recommended default (Redis-compatible protocol, lower resource usage). Neo4j is supported as an alternative.

### TEI Reranker

An optional [Text Embeddings Inference](https://github.com/huggingface/text-embeddings-inference) container that rescores search results using a cross-encoder model. Improves recall quality by ~15-20% compared to vector-only search. Communicates with the server over HTTP.

### Dashboard

A React single-page application with:
- Memory browser with pagination, filtering, and search
- Classification category views
- Entity management
- Feedback review
- Request audit log
- System statistics
- i18n support (English, Traditional Chinese, Simplified Chinese)

## Data Model

Memories are stored in PostgreSQL with this payload structure:

```json
{
  "id": "uuid",
  "memory": "User prefers dark mode",
  "hash": "sha256-of-memory-text",
  "metadata": {
    "category": "preference",
    "subcategory": "ui",
    "confidence": "high",
    "classified_at": "2025-01-15T10:30:00Z",
    "verified": true,
    "importance_score": 0.85,
    "source": "conversation"
  },
  "user_id": "alice",
  "agent_id": "my-agent",
  "run_id": "session-123",
  "created_at": "2025-01-15T10:30:00Z",
  "updated_at": "2025-01-15T10:30:00Z"
}
```

## Plugin Architecture

The OpenClaw plugin bridges AI agent conversations to the memory server:

```
User message ──> OpenClaw Gateway
                     │
                     ├── autoRecall hook
                     │       └── POST /search/recall ──> mem0-stack-oss
                     │       └── Inject memories into agent context
                     │
                     v
                 Agent processes message
                     │
                     ├── autoCapture hook
                     │       └── POST /memories ──> mem0-stack-oss
                     │       └── Background classification triggered
                     │
                     ├── Memory tools (8 tools available to the agent)
                     │       └── search, add, delete, list, feedback, etc.
                     │
                     └── Noise filtering
                             └── Skips trivial messages (greetings, acknowledgments)
```

The plugin includes:
- **autoRecall**: Before each agent turn, searches for relevant memories and injects them into the system prompt.
- **autoCapture**: After each agent turn, stores the conversation context as new memories.
- **Noise filtering**: Bilingual (English + Chinese) filters to skip trivial messages that would not produce useful memories.
- **Identity mapping**: Maps OpenClaw user/agent identifiers to mem0 entity IDs.
- **8 memory tools**: Exposes memory operations as tools the agent can call directly.
