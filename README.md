# mem0-stack-oss

Self-hosted memory API server for AI agents -- built on [mem0](https://github.com/mem0ai/mem0) with automatic classification, importance decay, semantic deduplication, and a React dashboard.

## Features

- **Vector search + graph memory** -- pgvector for semantic search, FalkorDB (or Neo4j) for entity relationships
- **Classification pipeline** -- LLM-powered tagging with optional second-LLM verification
- **Combined recall** -- UNION long-term + session memory in a single query with reranking
- **Memory lifecycle** -- importance decay, semantic dedup, TTL expiry, feedback-driven suppression
- **Dashboard** -- React web UI with i18n (English, Traditional Chinese, Simplified Chinese)
- **Plugin system** -- OpenClaw gateway plugin for automatic memory capture and recall
- **Full observability** -- request audit log, source tracking, entity management, statistics

## Architecture

```
               +------------------+           +-------------------+
               |  Dashboard       |           |  OpenClaw Gateway |
               |  (React SPA)     |           |  + mem0 plugin    |
               +--------+---------+           +---------+---------+
                        |                               |
                        |  /api/*                       |  HTTP
                        v                               v
               +----------------------------------------+--------+
               |             mem0-stack-oss  (FastAPI)            |
               |                                                 |
               |  AsyncMemory SDK   Classification   Maintenance |
               +-----+-------------+----------------+-----------+
                     |             |                |
            +--------+    +-------+-------+   +----+----+
            v             v               v   v         v
   +--------------+  +----------+  +-------------+  +--------+
   |  PostgreSQL  |  | FalkorDB |  | LLM API     |  | TEI    |
   |  + pgvector  |  | (graph)  |  | (OpenAI-    |  | Rerank |
   |              |  |          |  |  compatible) |  | (opt.) |
   +--------------+  +----------+  +-------------+  +--------+
```

## Quick Start

```bash
# 1. Clone
git clone https://github.com/farrrr/mem0-stack-oss.git
cd mem0-stack-oss

# 2. Configure
cp .env.example .env
# Edit .env -- set OPENAI_API_KEY and PG_PASSWORD at minimum

# 3. Start all services
docker compose up -d

# 4. Verify
curl http://localhost:8080/api/health
# {"status": "ok"}
```

Open `http://localhost:8080` for the dashboard. The API is available at `http://localhost:8080/api/` (proxied) or directly at `http://localhost:8090` (when not using Docker Compose).

### Add your first memory

```bash
curl -X POST http://localhost:8080/api/memories \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "I prefer dark mode and use VS Code as my editor."}
    ],
    "user_id": "alice"
  }'
```

### Search for it

```bash
curl -X POST http://localhost:8080/api/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What editor does Alice use?",
    "user_id": "alice"
  }'
```

## Docker Compose Services

| Service | Image | Port | Description |
|---------|-------|------|-------------|
| `postgres` | `pgvector/pgvector:pg16` | 5432 (localhost only) | Vector storage + metadata |
| `falkordb` | `falkordb/falkordb:latest` | 6379 (localhost only) | Graph memory |
| `api` | Built from `server/Dockerfile` | 8000 (internal) | FastAPI server |
| `dashboard` | Built from `dashboard/Dockerfile` | **8080** | nginx + React SPA + API proxy |
| `reranker` | `ghcr.io/huggingface/text-embeddings-inference:1.7` | 8184 (localhost only) | GPU reranker (opt., `--profile gpu`) |

To enable the GPU reranker:

```bash
docker compose --profile gpu up -d
```

## Configuration

All configuration is via the `.env` file. See [docs/configuration.md](docs/configuration.md) for the complete reference.

Key settings:

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENAI_API_KEY` | -- | Required. LLM + embedding API key |
| `PG_PASSWORD` | -- | Required. PostgreSQL password |
| `LLM_PROVIDER` | `openai` | Any OpenAI-compatible provider |
| `LLM_MODEL` | `gpt-4.1-nano-2025-04-14` | Model for fact extraction |
| `LLM_BASE_URL` | *(empty)* | Custom endpoint (e.g. `https://api.cerebras.ai/v1`) |
| `RERANKER_PROVIDER` | *(empty)* | `tei` or `huggingface` -- leave empty to disable |
| `CLASSIFY_ENABLED` | `true` | Auto-classify memories after each add |
| `ADMIN_API_KEY` | *(empty)* | Set to secure all API endpoints |

## Tech Stack

| Component | Technology |
|-----------|-----------|
| API server | Python 3.12, FastAPI, uvicorn, mem0 SDK (AsyncMemory) |
| Vector store | PostgreSQL 16 + pgvector |
| Graph store | FalkorDB (default) or Neo4j |
| LLM | Any OpenAI-compatible API |
| Embedder | OpenAI text-embedding-3-small (default) |
| Reranker | HuggingFace TEI (bge-reranker-v2-m3) |
| Dashboard | React 19, TypeScript, Vite, Tailwind CSS, TanStack Query, react-i18next |
| Plugin | TypeScript, OpenClaw plugin SDK |

## Documentation

| Document | Description |
|----------|-------------|
| [Getting Started](docs/getting-started.md) | Prerequisites, step-by-step setup, first memory |
| [Configuration](docs/configuration.md) | Complete environment variable reference |
| [Architecture](docs/architecture.md) | System design, pipeline flows, data model |
| [Deployment](docs/deployment.md) | Docker Compose, systemd, SSL, backups |
| [API Reference](docs/api-reference.md) | Every endpoint with curl examples |

## What's Different from Upstream mem0

| Feature | Upstream | mem0-stack-oss |
|---------|----------|----------------|
| SDK | sync `Memory` | async `AsyncMemory` |
| Init | module-level | FastAPI lifespan |
| Graph store | Neo4j only | FalkorDB (default) + Neo4j |
| LLM | OpenAI hard-coded | Any OpenAI-compatible endpoint |
| Reranker | None | TEI (HTTP) or HuggingFace (in-process) |
| Classification | None | 3-stage pipeline (classify + verify + store) |
| Combined search | None | UNION long-term + session + rerank |
| Pagination | Client-side only | Server-side with filtering |
| Request logging | None | Full audit trail |
| Feedback | None | positive/negative/very_negative + auto-suppress |
| Entities | None | List, filter, delete by type |
| Maintenance | None | Decay, dedup, cleanup-expired |
| Statistics | None | Dashboard-ready aggregations |
| Source tracking | None | Original conversation per memory |
| Dashboard | None | React + i18n (en/zh-TW/zh-CN) |

## Project Structure

```
mem0-stack-oss/
├── compose.yaml                # Docker Compose (all services)
├── .env.example                # Root config template
├── server/
│   ├── main.py                 # FastAPI app (all endpoints)
│   ├── prompts/                # Customizable LLM prompts
│   ├── .env.example            # Server-specific config reference
│   ├── requirements.txt
│   └── Dockerfile
├── dashboard/                  # React web UI
│   ├── src/pages/              # 10 pages + login
│   ├── src/i18n/               # en, zh-TW, zh-CN
│   └── Dockerfile
├── plugins/
│   └── openclaw/               # OpenClaw gateway memory plugin
├── systemd/
│   └── mem0-api.service        # systemd service template
└── docs/                       # Documentation
```

## License

Apache License 2.0 — see [LICENSE](LICENSE).

This project uses the [mem0](https://github.com/mem0ai/mem0) SDK as a library dependency, also licensed under Apache 2.0. See [NOTICE](NOTICE) for details.
