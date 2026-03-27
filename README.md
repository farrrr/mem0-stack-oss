# mem0-stack-oss

Self-hosted memory API server for AI agents — built on [mem0](https://github.com/mem0ai/mem0) with automatic classification, importance decay, semantic deduplication, and a dashboard-ready REST API.

## What is this?

A production-ready API server that wraps the mem0 SDK and adds features you need to run memory at scale:

- **Classification pipeline** — automatically categorize every memory with LLM-powered tagging
- **Combined recall search** — UNION long-term + session memory in a single query, with optional reranking
- **Memory lifecycle** — importance decay, semantic dedup, TTL expiry, and cleanup
- **Feedback loop** — users can flag bad memories; `very_negative` auto-suppresses
- **Full observability** — request logging, source tracking, entity management, statistics
- **Dashboard** — React-based web UI with i18n (English, 繁體中文, 简体中文)

## Architecture

```
Client / AI Agent
    |
    v
mem0-stack-oss (FastAPI + AsyncMemory)
    |
    ├── pgvector (vector search + metadata)
    ├── FalkorDB or Neo4j (graph memory)
    └── Any OpenAI-compatible LLM (fact extraction + classification)

Dashboard (React) ──→ mem0-stack-oss API
```

## Quick start

### 1. Clone and configure

```bash
git clone https://github.com/farrrr/mem0-stack-oss.git /opt/mem0-stack
cd /opt/mem0-stack/server
cp .env.example .env
# Edit .env with your API keys and database credentials
```

### 2a. Run with systemd (recommended for production)

```bash
# Create virtual environment
python3 -m venv /opt/mem0-stack/venv
/opt/mem0-stack/venv/bin/pip install -r /opt/mem0-stack/server/requirements.txt

# Install systemd service
mkdir -p ~/.config/systemd/user
cp /opt/mem0-stack/systemd/mem0-api.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now mem0-api

# Verify
curl -X GET http://localhost:8090/health
```

Requires PostgreSQL with pgvector and FalkorDB (or Neo4j) running separately.

### 2b. Run with Docker Compose

```bash
cd /opt/mem0-stack/server
docker compose up
```

The API is available at `http://localhost:8888`. Visit `/docs` for the interactive OpenAPI explorer.

### 2c. Run directly (development)

```bash
cd /opt/mem0-stack/server
/opt/mem0-stack/venv/bin/uvicorn main:app --host 0.0.0.0 --port 8090 --reload
```

### 3. Dashboard (optional)

```bash
cd /opt/mem0-stack/dashboard
npm install
npm run build

# Development with hot-reload
npm run dev
```

## Service management

```bash
# Start / stop / restart
systemctl --user start mem0-api
systemctl --user stop mem0-api
systemctl --user restart mem0-api

# View logs
journalctl --user -u mem0-api -f

# Check status
systemctl --user status mem0-api
```

## API endpoints

### Core

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/memories` | Create memories (triggers background classification) |
| `GET` | `/memories` | List memories with server-side pagination and filtering |
| `GET` | `/memories/{id}` | Get a specific memory |
| `PUT` | `/memories/{id}` | Update a memory |
| `DELETE` | `/memories/{id}` | Delete a memory |
| `DELETE` | `/memories` | Delete all memories for an entity |
| `POST` | `/search` | Search memories via SDK |
| `POST` | `/configure` | Hot-reload memory configuration |
| `POST` | `/reset` | Reset all memories |
| `GET` | `/health` | Health check |

### Memories pagination

`GET /memories` supports server-side pagination and filtering:

| Parameter | Type | Description |
|-----------|------|-------------|
| `user_id` | string | **Required** (one of user_id/agent_id/run_id) |
| `agent_id` | string | Filter by agent |
| `run_id` | string | Filter by session |
| `limit` | int | Results per page (default 35, max 500) |
| `offset` | int | Pagination offset |
| `category` | string | Filter by classification category |
| `confidence` | string | Filter by confidence (high/medium/low) |
| `date_range` | string | Filter by time: `1d`, `7d`, or `30d` |
| `search` | string | Text search (ILIKE) |

### Classification

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/taxonomy` | Get classification categories |
| `POST` | `/memories/{id}/reclassify` | Reclassify a single memory |
| `POST` | `/reclassify-all` | Bulk reclassify (supports `only_unclassified`) |

### Combined recall

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/search/recall` | UNION long-term + session search with optional reranking |

### Feedback

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/memories/{id}/feedback` | Submit feedback (positive/negative/very_negative) |
| `GET` | `/memories/{id}/feedback` | Get feedback for a memory |
| `GET` | `/feedback/stats` | Feedback statistics |

### Source tracking

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/memories/{id}/source` | Original conversation that produced this memory |
| `GET` | `/memories/{id}/history` | Memory change history |

### Entity management

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/entities` | List agents/apps for a user |
| `GET` | `/entities/by-type` | List entities by type (user/agent/app/run) |
| `GET` | `/entities/users` | List all users with memory counts |
| `DELETE` | `/entities/{type}/{id}` | Delete an entity's memories |

### Maintenance (requires `MAINTENANCE_API_KEY`)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/maintenance/decay` | Exponential importance score decay |
| `POST` | `/maintenance/dedup` | Semantic deduplication |
| `POST` | `/maintenance/cleanup-expired` | Remove expired and low-importance memories |

### Observability

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/stats` | Aggregated system statistics |
| `GET` | `/requests` | API request audit log |
| `GET` | `/requests/{id}` | Request detail |
| `GET` | `/requests/daily-stats` | Daily request counts for dashboards |

## Configuration

All configuration is via environment variables. See [`.env.example`](server/.env.example) for the full list.

### Key settings

| Variable | Default | Description |
|----------|---------|-------------|
| `LLM_PROVIDER` | `openai` | Any OpenAI-compatible provider |
| `LLM_MODEL` | `gpt-4.1-nano-2025-04-14` | Model for fact extraction |
| `LLM_BASE_URL` | *(empty)* | Custom endpoint (e.g. Cerebras, Together) |
| `GRAPH_PROVIDER` | `falkordb` | `falkordb` or `neo4j` |
| `RERANKER_PROVIDER` | *(empty)* | Set to `huggingface` to enable |
| `CLASSIFY_ENABLED` | `true` | Background classification after each add |
| `ADMIN_API_KEY` | *(empty)* | Set to secure all endpoints |
| `MAINTENANCE_API_KEY` | *(empty)* | Set to protect maintenance endpoints |

### Custom prompts

The `server/prompts/` directory contains customizable templates:

- `extraction.txt` — fact extraction prompt (supports `{date}` placeholder, replaced by SDK on each call)
- `classification.txt` — classification prompt (supports `{taxonomy}` and `{memory_text}`)
- `taxonomy.json` — classification categories and subcategories

## What's different from upstream mem0 server

| Feature | Upstream | mem0-stack-oss |
|---------|----------|----------------|
| SDK | sync `Memory` | async `AsyncMemory` |
| Init | module-level | FastAPI lifespan |
| Graph store | Neo4j only | FalkorDB (default) + Neo4j |
| LLM | OpenAI hard-coded | Any OpenAI-compatible endpoint |
| Reranker | None | Optional (HuggingFace) |
| Classification | None | 3-stage pipeline (classify + verify + store) |
| Combined search | None | UNION long-term + session + rerank |
| Pagination | Client-side only | Server-side with filtering |
| Request logging | None | Full audit trail |
| Feedback | None | positive/negative/very_negative + auto-suppress |
| Entities | None | List, filter, delete by type |
| Maintenance | None | Decay, dedup, cleanup-expired |
| Statistics | None | Dashboard-ready aggregations |
| Source tracking | None | Original conversation per memory |
| Connection pool | Default (5) | Configurable (default 2-80) |
| Dashboard | None | React + i18n (en/zh-TW/zh-CN) |
| Deployment | Docker only | systemd + Docker |

## Project structure

```
mem0-stack-oss/
├── server/
│   ├── main.py                 # FastAPI app (all endpoints)
│   ├── prompts/
│   │   ├── extraction.txt      # Fact extraction prompt
│   │   ├── classification.txt  # Classification prompt
│   │   └── taxonomy.json       # Category definitions
│   ├── .env.example            # Environment variable reference
│   ├── requirements.txt
│   ├── Dockerfile
│   ├── dev.Dockerfile
│   ├── docker-compose.yaml
│   └── Makefile
├── dashboard/                  # React web UI
│   ├── src/
│   │   ├── pages/              # 7 pages + login
│   │   ├── components/         # Shared UI components
│   │   ├── i18n/               # en, zh-TW, zh-CN
│   │   └── lib/                # API client, types, utils
│   ├── package.json
│   └── vite.config.ts
├── systemd/
│   └── mem0-api.service        # systemd service template
└── docs/
    └── features/
        └── rest-api.md
```

## License

This project builds on [mem0](https://github.com/mem0ai/mem0), licensed under Apache 2.0.
