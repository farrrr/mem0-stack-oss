# Configuration Reference

All configuration is via environment variables. When you use Docker Compose, set them in the root `.env` file. For standalone server deployments, use `server/.env`.

```bash
cp .env.example .env
# Edit .env with your values
```

## Required Variables

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | API key for LLM and embeddings. Used as fallback when `LLM_API_KEY` or `EMBEDDER_API_KEY` are not set. |
| `PG_PASSWORD` | PostgreSQL password (Docker Compose only). |

## LLM (Fact Extraction)

Any OpenAI-compatible endpoint works (OpenAI, Cerebras, Together, Groq, etc.).

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `LLM_PROVIDER` | string | `openai` | LLM provider name. |
| `LLM_MODEL` | string | `gpt-4.1-nano-2025-04-14` | Model for fact extraction and memory actions. |
| `LLM_API_KEY` | string | *(falls back to `OPENAI_API_KEY`)* | API key for the LLM provider. |
| `LLM_BASE_URL` | string | *(empty)* | Custom endpoint URL. Set for non-OpenAI providers (e.g. `https://api.cerebras.ai/v1`). |
| `LLM_TEMPERATURE` | float | `0.2` | Sampling temperature. |
| `LLM_MAX_TOKENS` | int | `8192` | Maximum output tokens. |

## Embedder

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `EMBEDDER_PROVIDER` | string | `openai` | Embedding provider. |
| `EMBEDDER_MODEL` | string | `text-embedding-3-small` | Embedding model name. |
| `EMBEDDER_DIMS` | int | `1536` | Embedding vector dimensions. Must match the model. |
| `EMBEDDER_API_KEY` | string | *(falls back to `OPENAI_API_KEY`)* | API key for embeddings. |

## Graph Store

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `GRAPH_PROVIDER` | string | `falkordb` | Graph backend: `falkordb` or `neo4j`. |
| `FALKORDB_HOST` | string | `localhost` | FalkorDB host. Docker Compose overrides this to `falkordb`. |
| `FALKORDB_PORT` | int | `6379` | FalkorDB port. |
| `FALKORDB_DATABASE` | string | `mem0` | FalkorDB database name. |
| `NEO4J_URI` | string | `bolt://neo4j:7687` | Neo4j Bolt connection URI. |
| `NEO4J_USERNAME` | string | `neo4j` | Neo4j username. |
| `NEO4J_PASSWORD` | string | `mem0graph` | Neo4j password. |

## Graph LLM (Optional)

A separate LLM for graph entity extraction. Falls back to the main LLM settings when not set.

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `GRAPH_LLM_PROVIDER` | string | *(main LLM)* | Provider for graph LLM. |
| `GRAPH_LLM_MODEL` | string | *(main LLM)* | Model for graph LLM. |
| `GRAPH_LLM_API_KEY` | string | *(main LLM)* | API key for graph LLM. |
| `GRAPH_LLM_BASE_URL` | string | *(main LLM)* | Endpoint for graph LLM. |

## Fallback LLM (Optional)

Used when the primary LLM fails (e.g., rate limits, timeouts).

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `FALLBACK_LLM_PROVIDER` | string | `openai` | Fallback provider name. |
| `FALLBACK_LLM_MODEL` | string | *(empty)* | Fallback model name. Leave empty to disable. |
| `FALLBACK_LLM_API_KEY` | string | *(falls back to `OPENAI_API_KEY`)* | Fallback API key. |
| `FALLBACK_LLM_BASE_URL` | string | *(empty)* | Fallback endpoint URL. |

## Reranker (Optional)

Improves search quality by rescoring results with a cross-encoder model.

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `RERANKER_PROVIDER` | string | *(empty)* | `tei`, `huggingface`, or empty to disable. |
| `RERANKER_MODEL` | string | `BAAI/bge-reranker-v2-m3` | Reranker model name. |
| `RERANKER_TOP_K` | int | `5` | Number of results after reranking. |
| `RERANKER_BASE_URL` | string | `http://localhost:8184` | TEI endpoint URL (when provider=`tei`). Docker Compose uses `http://reranker:80`. |
| `RERANKER_TIMEOUT` | int | `10` | HTTP timeout in seconds (TEI mode). |
| `RERANKER_DEVICE` | string | `cpu` | Device for in-process HuggingFace mode (`cpu` or `cuda`). |

### Reranker Modes

| Mode | Config | Pros | Cons |
|------|--------|------|------|
| **TEI** (recommended) | `RERANKER_PROVIDER=tei` | No PyTorch in server, fast startup, ~200MB | +2-5ms HTTP overhead |
| **HuggingFace** (in-process) | `RERANKER_PROVIDER=huggingface` | Lowest latency (~5ms) | Requires PyTorch (~2GB), slow startup |
| **Disabled** | `RERANKER_PROVIDER=` (empty) | Simplest setup | Vector-only search, lower recall quality |

To enable TEI via Docker Compose, start with the `gpu` profile:

```bash
docker compose --profile gpu up -d
```

To run TEI standalone:

```bash
docker run -d --name tei-reranker --gpus all \
  -p 127.0.0.1:8184:80 \
  ghcr.io/huggingface/text-embeddings-inference:1.7 \
  --model-id BAAI/bge-reranker-v2-m3 --dtype float16 --port 80
```

Without a GPU, omit `--gpus all` and use `--dtype float32`.

## Classification Pipeline

Runs as a background task after each memory addition.

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `CLASSIFY_ENABLED` | bool | `true` | Enable automatic classification after each add. |
| `CLASSIFY_MODEL` | string | *(main LLM model)* | Model for classification. |
| `CLASSIFY_API_KEY` | string | *(main LLM key)* | API key for classification. |
| `CLASSIFY_BASE_URL` | string | *(main LLM URL)* | Endpoint for classification. |

## Verification (Optional)

A second LLM pass that verifies classification results. Useful for catching misclassifications.

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `VERIFY_ENABLED` | bool | `false` | Enable classification verification. |
| `VERIFY_PROVIDER` | string | `openai` | `openai` or `anthropic`. |
| `VERIFY_MODEL` | string | *(empty)* | Model for verification. |
| `VERIFY_API_KEY` | string | *(empty)* | API key for verification. |

## Authentication

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `ADMIN_API_KEY` | string | *(empty)* | Set to require `X-API-Key` header on all endpoints. Leave empty for no auth. |
| `MAINTENANCE_API_KEY` | string | *(empty)* | Set to protect maintenance and entity management endpoints via `X-Maintenance-Key` header. |

When `ADMIN_API_KEY` is set, every request must include `X-API-Key: <your-key>`. Minimum recommended length is 16 characters. The server logs a warning at startup when the key is not set.

## PostgreSQL

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `POSTGRES_HOST` | string | `postgres` | PostgreSQL host. |
| `POSTGRES_PORT` | int | `5432` | PostgreSQL port. |
| `POSTGRES_DB` | string | `postgres` | Database name. |
| `POSTGRES_USER` | string | `postgres` | Database user. |
| `POSTGRES_PASSWORD` | string | `postgres` | Database password. |
| `POSTGRES_COLLECTION_NAME` | string | `memories` | Table name for memories. |
| `PG_POOL_MIN` | int | `2` | Minimum connection pool size. |
| `PG_POOL_MAX` | int | `80` | Maximum connection pool size. |

### Docker Compose PostgreSQL

When using Docker Compose, configure PostgreSQL via the root `.env`:

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `PG_PASSWORD` | string | -- | **Required.** PostgreSQL password. |
| `PG_DB` | string | `mem0` | Database name. |
| `PG_USER` | string | `mem0` | Database user. |
| `PG_PORT` | int | `5432` | Host port binding. |

Docker Compose automatically maps these to the `POSTGRES_*` variables inside the API container.

## FalkorDB (Docker Compose)

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `FALKORDB_PORT` | int | `6379` | Host port binding for FalkorDB. |

## Dashboard (Docker Compose)

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `DASHBOARD_PORT` | int | `8080` | Host port for the dashboard. |

## Reranker GPU (Docker Compose)

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `RERANKER_PORT` | int | `8184` | Host port for the TEI reranker container. |
| `RERANKER_MODEL` | string | `BAAI/bge-reranker-v2-m3` | Reranker model to load. |

## History

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `HISTORY_DB_PATH` | string | `/app/history/history.db` | Path for the SQLite history database used by the mem0 SDK. |

## Custom Prompts

The `server/prompts/` directory ships `.example` files. Copy them before first use:

```bash
cd server/prompts
for f in *.example; do cp "$f" "${f%.example}"; done
```

The active files (without `.example` suffix) are in `.gitignore`, so `git pull` will never overwrite your customizations.

### `extraction.txt`

Controls how facts are extracted from conversations. Supports the `{date}` placeholder, which is replaced with the current date at runtime by the SDK.

### `graph_extraction.txt`

Controls how entities and relationships are extracted for graph memory. Supports the `{date}` placeholder.

### `classification.txt`

Controls how memories are classified. Supports two placeholders:

- `{taxonomy}` -- replaced with the category list from `taxonomy.json`
- `{memory_text}` -- replaced with the memory text being classified

### `taxonomy.json`

Defines classification categories and subcategories:

```json
{
  "categories": ["preference", "biographical", "technical", ...],
  "subcategories": {
    "preference": {
      "tool": "Tool/software preferences",
      "workflow": "Workflow preferences"
    }
  }
}
```

Edit this file to add, remove, or rename categories. The classification LLM uses these categories when tagging memories.

## Connection Pool Tuning

The PostgreSQL connection pool defaults suit moderate workloads:

- `PG_POOL_MIN=2` -- minimum open connections
- `PG_POOL_MAX=80` -- maximum open connections

For low-traffic deployments, reduce `PG_POOL_MAX` to 10-20. For high-traffic production, increase `PG_POOL_MIN` to match your baseline concurrency.
