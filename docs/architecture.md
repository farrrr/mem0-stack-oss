# Architecture Overview

## System Diagram

```
               +------------------+           +-------------------+
               |  Dashboard       |           |  OpenClaw Gateway |
               |  (React SPA)     |           |  + mem0 plugin    |
               +--------+---------+           +---------+---------+
                        |                               |
                  nginx | /api/*                        | HTTP
                 proxy  |                               |
                        v                               v
               +------------------------------------------------+
               |           mem0-stack-oss  API (FastAPI)         |
               |                                                |
               |  +------------+  +-----------+  +------------+ |
               |  | AsyncMemory|  | Classify  |  | Maintenance| |
               |  | SDK        |  | Pipeline  |  | Jobs       | |
               |  +-----+------+  +-----+-----+  +-----+------+ |
               +--------|---------------|---------------|--------+
                        |               |               |
           +------------+------+--------+-------+-------+
           |                   |                |
           v                   v                v
  +-----------------+   +-----------+   +---------------+
  |  PostgreSQL 16  |   | FalkorDB  |   | OpenAI-compat |
  |  + pgvector     |   | (Redis    |   | LLM API       |
  |                 |   |  protocol)|   |               |
  |  - memories     |   |           |   | - extraction  |
  |  - api_requests |   | - entity  |   | - classify    |
  |  - mem_sources  |   |   graph   |   | - verify      |
  |  - mem_feedback |   | - per-user|   | - graph       |
  +-----------------+   +-----------+   +---------------+
                                               |
                                        +------+------+
                                        | TEI Reranker|
                                        | (optional,  |
                                        |  GPU)       |
                                        +-------------+
```

## ADD Pipeline (`POST /memories`)

When you add a memory, the server processes it through several stages:

```
Client sends messages + user_id
    |
    v
[1] Validate request (requires at least one identifier)
    |
    v
[2] AsyncMemory.add()
    |-- LLM extracts discrete facts from the conversation
    |-- Each fact is embedded via the embedder model
    |-- Embeddings stored in pgvector (memories table)
    |-- SDK handles dedup: if a similar fact exists, it UPDATEs instead of INSERTing
    |-- Graph entities extracted and stored in FalkorDB (per-user namespace)
    |
    v
[3] Response returned immediately (memory IDs + events)
    |
    v
[4] Background tasks (fire-and-forget):
    |-- save_memory_source: store original conversation messages
    |-- init_memory_metadata: set importance_score=1.0, last_accessed_at
    |-- classify_and_store: LLM classifies each new memory
    |       |
    |       +-- [4a] classify_memory: LLM assigns category + subcategory + tags
    |       |
    |       +-- [4b] verify_classification (optional): second LLM confirms
    |       |
    |       +-- [4c] store_classification: write to payload.metadata in PG
    |
    +-- log_request: audit log entry
```

Events returned per memory:

| Event | Meaning |
|-------|---------|
| `ADD` | New memory created |
| `UPDATE` | Existing similar memory updated |
| `DELETE` | Memory removed (SDK-level dedup) |
| `NOOP` | No action needed (fact already stored) |

## SEARCH Pipeline (`POST /search`)

```
Client sends query + user_id
    |
    v
[1] AsyncMemory.search()
    |-- Query embedded via embedder model
    |-- pgvector cosine similarity search
    |-- (Optional) Reranker rescores top results
    |
    v
[2] Results returned with similarity scores and metadata
    |
    v
[3] Background tasks:
    +-- update_last_accessed: touch last_accessed_at for hit memories
    +-- log_request: audit log entry
```

## RECALL Pipeline (`POST /search/recall`)

A custom pipeline that bypasses the SDK for combined long-term + session search:

```
Client sends query + user_id + optional run_id
    |
    v
[1] Embed query once
    |
    v
[2] SQL query:
    |-- When run_id is provided:
    |       (SELECT from memories WHERE user_id = ?)
    |       UNION ALL
    |       (SELECT from memories WHERE user_id = ? AND run_id = ?)
    |-- When run_id is absent:
    |       SELECT from memories WHERE user_id = ?
    |
    v
[3] Deduplicate (UNION may produce overlapping results)
    |
    v
[4] (Optional) Reranker rescores combined results
    |
    v
[5] Threshold filter (remove low-scoring results)
    |
    v
[6] Return top-K results
```

This approach merges persistent user memories with session-specific memories in a single request, reducing latency for AI agent workflows.

## Classification Pipeline

Every memory added goes through a background classification pipeline:

```
Memory text
    |
    v
[Stage 1] Classify
    |-- LLM reads the memory + taxonomy prompt
    |-- Returns: category, subcategory, tags, confidence
    |
    v
[Stage 2] Verify (optional, when VERIFY_ENABLED=true)
    |-- A different LLM (can be a different provider, e.g. Anthropic)
    |-- Rates confidence as high/medium/low
    |
    v
[Stage 3] Store
    +-- Classification metadata written to memory payload in PostgreSQL
```

- **Stage 1 (Classify)**: Uses the classification prompt template with the taxonomy to assign categories. Controlled by `CLASSIFY_MODEL`.
- **Stage 2 (Verify)**: Optional second opinion. Useful when classification accuracy is critical. Supports both OpenAI and Anthropic providers.
- **Stage 3 (Store)**: Writes `category`, `subcategory`, `tags`, `confidence`, `classified_by`, `classified_at` to the memory metadata.

## Memory Lifecycle

```
Add --> Classify --> Available for search/recall
                       |
                       +-- Decay (importance_score decreases over time)
                       +-- Dedup (semantically similar memories merged)
                       +-- Feedback
                       |       +-- positive: no action
                       |       +-- negative: logged for review
                       |       +-- very_negative: auto-suppressed (hidden from search)
                       +-- Cleanup (expired + low-importance removed)
```

Maintenance operations run on demand via `/maintenance/*` endpoints:

| Endpoint | What it does |
|----------|-------------|
| `POST /maintenance/decay` | Exponential decay on importance_score based on days since last access. Default half-life: ~70 days. |
| `POST /maintenance/dedup` | Cosine similarity scan to find and remove near-duplicate memories. Default threshold: 0.95. |
| `POST /maintenance/cleanup-expired` | Remove memories past their TTL `expires_at` and optionally those below an importance threshold. |

These endpoints support `dry_run=true` (default) for previewing changes before applying them.

## Component Descriptions

### AsyncMemory SDK

The server uses the async variant of the [mem0 SDK](https://github.com/mem0ai/mem0) (`AsyncMemory`). This provides non-blocking I/O for all database and LLM operations. The instance is initialized via FastAPI's lifespan context manager and shared across all requests.

### pgvector (PostgreSQL)

Stores memory embeddings and metadata. The `memories` table contains:

- Vector embedding (for cosine similarity search)
- Memory text (the extracted fact)
- Entity identifiers (`user_id`, `agent_id`, `run_id`)
- Classification metadata (`category`, `subcategory`, `confidence`, `tags`)
- Lifecycle metadata (`importance_score`, `last_accessed_at`, `expires_at`)
- Timestamps (`created_at`, `updated_at`)

Extension tables managed by the server:

| Table | Purpose |
|-------|---------|
| `api_requests` | Audit log of all API requests |
| `memory_sources` | Original conversation messages per memory |
| `memory_feedback` | User feedback records |

### FalkorDB / Neo4j

Stores entity relationships extracted from conversations as a knowledge graph. Each user gets an isolated graph namespace (`mem0_{user_id}`). FalkorDB is the recommended default (Redis-compatible protocol, lower resource usage). Neo4j is supported as an alternative.

### TEI Reranker

An optional [Text Embeddings Inference](https://github.com/huggingface/text-embeddings-inference) container that rescores search results using a cross-encoder model (bge-reranker-v2-m3). Communicates with the server over HTTP. Improves recall quality compared to vector-only search.

### Dashboard

A React single-page application served by nginx. Pages include:

| Page | Description |
|------|-------------|
| Dashboard | Overview with stats and activity charts |
| Memories | Memory browser with pagination, filtering, and search |
| Search | Interactive memory search |
| Entities | User and agent entity management |
| Graph | Visual graph explorer (force-directed) |
| Stats | Detailed system statistics |
| Requests | API request audit log |
| Maintenance | Decay, dedup, and cleanup tools |
| Health | Service health checks |
| Login | API key authentication |

nginx proxies `/api/*` requests to the FastAPI server.

### OpenClaw Plugin

The OpenClaw plugin bridges AI agent conversations to the memory server:

```
User message --> OpenClaw Gateway
                     |
                     +-- autoRecall hook
                     |       +-- POST /search/recall --> mem0-stack-oss
                     |       +-- Inject memories into agent context
                     |
                     v
                 Agent processes message
                     |
                     +-- autoCapture hook
                     |       +-- POST /memories --> mem0-stack-oss
                     |
                     +-- 8 memory tools available to the agent
                     |
                     +-- Noise filtering (skip trivial messages)
```

## Data Model

### Memory Record

Each memory is stored as a row in the `memories` table with a JSONB `payload` column:

```json
{
  "data": "User prefers dark mode",
  "hash": "sha256-of-memory-text",
  "user_id": "alice",
  "agent_id": "my-agent",
  "run_id": "session-123",
  "created_at": "2025-01-15T10:30:00Z",
  "updated_at": "2025-01-15T10:30:00Z",
  "metadata": {
    "category": ["preference"],
    "subcategory": ["ui"],
    "tags": ["dark-mode", "theme"],
    "confidence": "high",
    "classified_by": "gpt-4.1-nano-2025-04-14",
    "classified_at": "2025-01-15T10:30:01Z",
    "verified_by": "anthropic/claude-haiku-4",
    "importance_score": 0.85,
    "last_accessed_at": "2025-01-16T09:00:00Z",
    "expires_at": null,
    "suppressed": false
  }
}
```

### Graph Entities

Graph data is stored in FalkorDB under the namespace `mem0_{user_id}`. Each graph contains:

- **Nodes**: Entities extracted from conversations (people, tools, concepts)
- **Edges**: Relationships between entities (uses, prefers, works_with)

### Feedback Record

```json
{
  "id": 1,
  "memory_id": "uuid",
  "user_id": "alice",
  "feedback": "very_negative",
  "reason": "This memory is incorrect",
  "created_at": "2025-01-15T11:00:00Z"
}
```

When feedback is `very_negative`, the memory's `metadata.suppressed` flag is set to `true`, hiding it from search results.
