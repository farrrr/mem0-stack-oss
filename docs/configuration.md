# Configuration Reference

All configuration is via environment variables in `server/.env`. Copy from `.env.example` to get started:

```bash
cp server/.env.example server/.env
```

## Environment Variables

### LLM (Fact Extraction)

Any OpenAI-compatible endpoint works (OpenAI, Cerebras, Together, Groq, etc.).

| Variable | Default | Description |
|----------|---------|-------------|
| `LLM_PROVIDER` | `openai` | LLM provider name |
| `LLM_MODEL` | `gpt-4.1-nano-2025-04-14` | Model for fact extraction |
| `LLM_API_KEY` | *(empty)* | API key (falls back to `OPENAI_API_KEY`) |
| `LLM_BASE_URL` | *(empty)* | Custom endpoint URL (e.g. `https://api.cerebras.ai/v1`) |
| `LLM_TEMPERATURE` | `0.2` | Sampling temperature |
| `LLM_MAX_TOKENS` | `8192` | Maximum output tokens |

### Embedder

| Variable | Default | Description |
|----------|---------|-------------|
| `EMBEDDER_PROVIDER` | `openai` | Embedding provider |
| `EMBEDDER_MODEL` | `text-embedding-3-small` | Embedding model |
| `EMBEDDER_DIMS` | `1536` | Embedding dimensions |
| `EMBEDDER_API_KEY` | *(empty)* | API key (falls back to `OPENAI_API_KEY`) |

### Reranker (Optional)

| Variable | Default | Description |
|----------|---------|-------------|
| `RERANKER_PROVIDER` | *(empty)* | `tei`, `huggingface`, or empty to disable |
| `RERANKER_MODEL` | `BAAI/bge-reranker-v2-m3` | Reranker model name |
| `RERANKER_TOP_K` | `5` | Number of results after reranking |
| `RERANKER_BASE_URL` | `http://localhost:8184` | TEI endpoint (when provider=tei) |
| `RERANKER_TIMEOUT` | `10` | HTTP timeout in seconds (TEI mode) |
| `RERANKER_DEVICE` | `cpu` | Device for in-process mode (`cpu` or `cuda`) |

### Graph Store

| Variable | Default | Description |
|----------|---------|-------------|
| `GRAPH_PROVIDER` | `falkordb` | `falkordb` or `neo4j` |
| `FALKORDB_HOST` | `localhost` | FalkorDB host |
| `FALKORDB_PORT` | `6379` | FalkorDB port |
| `FALKORDB_DATABASE` | `mem0` | FalkorDB database name |
| `NEO4J_URI` | `bolt://neo4j:7687` | Neo4j connection URI |
| `NEO4J_USERNAME` | `neo4j` | Neo4j username |
| `NEO4J_PASSWORD` | `mem0graph` | Neo4j password |

### Graph LLM (Optional)

Separate LLM for graph operations. Falls back to the main LLM settings if not set.

| Variable | Default | Description |
|----------|---------|-------------|
| `GRAPH_LLM_PROVIDER` | *(main LLM)* | Provider for graph LLM |
| `GRAPH_LLM_MODEL` | *(main LLM)* | Model for graph LLM |
| `GRAPH_LLM_API_KEY` | *(main LLM)* | API key for graph LLM |
| `GRAPH_LLM_BASE_URL` | *(main LLM)* | Endpoint for graph LLM |

### Fallback LLM (Optional)

Used when the primary LLM fails.

| Variable | Default | Description |
|----------|---------|-------------|
| `FALLBACK_LLM_MODEL` | *(empty)* | Fallback model name |
| `FALLBACK_LLM_API_KEY` | *(empty)* | Fallback API key (falls back to `OPENAI_API_KEY`) |

### PostgreSQL (pgvector)

| Variable | Default | Description |
|----------|---------|-------------|
| `POSTGRES_HOST` | `postgres` | PostgreSQL host |
| `POSTGRES_PORT` | `5432` | PostgreSQL port |
| `POSTGRES_DB` | `postgres` | Database name |
| `POSTGRES_USER` | `postgres` | Database user |
| `POSTGRES_PASSWORD` | `postgres` | Database password |
| `POSTGRES_COLLECTION_NAME` | `memories` | Table/collection name for memories |
| `PG_POOL_MIN` | `2` | Minimum connection pool size |
| `PG_POOL_MAX` | `80` | Maximum connection pool size |

### Classification Pipeline

Runs as a background task after each memory addition.

| Variable | Default | Description |
|----------|---------|-------------|
| `CLASSIFY_ENABLED` | `true` | Enable/disable classification |
| `CLASSIFY_MODEL` | *(main LLM)* | Model for classification |
| `CLASSIFY_API_KEY` | *(main LLM)* | API key for classification |
| `CLASSIFY_BASE_URL` | *(main LLM)* | Endpoint for classification |

### Verification (Optional)

Optional second LLM pass to verify classification results.

| Variable | Default | Description |
|----------|---------|-------------|
| `VERIFY_ENABLED` | `false` | Enable verification step |
| `VERIFY_PROVIDER` | `openai` | `openai` or `anthropic` |
| `VERIFY_MODEL` | *(empty)* | Model for verification |
| `VERIFY_API_KEY` | *(empty)* | API key for verification |

### Auth

| Variable | Default | Description |
|----------|---------|-------------|
| `ADMIN_API_KEY` | *(empty)* | API key for all endpoints (empty = no auth) |
| `MAINTENANCE_API_KEY` | *(empty)* | API key for maintenance endpoints |

When `ADMIN_API_KEY` is set, all requests must include the `Authorization: Bearer <key>` header. Minimum recommended length is 16 characters.

### History

| Variable | Default | Description |
|----------|---------|-------------|
| `HISTORY_DB_PATH` | `/app/history/history.db` | Path for the SQLite history database |

### Legacy

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | Fallback for `LLM_API_KEY` and `EMBEDDER_API_KEY` |

## Custom Prompts

The `server/prompts/` directory contains customizable templates:

### `extraction.txt`

Controls how facts are extracted from conversations. Supports the `{date}` placeholder which is replaced with the current date at runtime.

### `classification.txt`

Controls how memories are classified into categories. Supports two placeholders:
- `{taxonomy}` — replaced with the category list from `taxonomy.json`
- `{memory_text}` — replaced with the memory text being classified

### `taxonomy.json`

Defines the classification categories and subcategories. Structure:

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

Edit this file to add, remove, or rename categories. The classification LLM will use these categories when tagging memories.

## Reranker Modes

### TEI (Recommended)

Runs as a separate Docker container. No PyTorch dependency in the main server.

```bash
docker run -d --name tei-reranker --gpus all \
  -p 127.0.0.1:8184:80 \
  ghcr.io/huggingface/text-embeddings-inference:1.7 \
  --model-id BAAI/bge-reranker-v2-m3 --dtype float16 --port 80
```

```bash
RERANKER_PROVIDER=tei
RERANKER_BASE_URL=http://localhost:8184
```

Without a GPU, omit `--gpus all` and use `--dtype float32`.

### HuggingFace (In-Process)

Loads the model directly into the server process. Requires PyTorch.

```bash
pip install transformers torch
```

```bash
RERANKER_PROVIDER=huggingface
RERANKER_MODEL=BAAI/bge-reranker-v2-m3
RERANKER_DEVICE=cpu   # or cuda
```

### Disabled

Leave `RERANKER_PROVIDER` empty (or unset). Search results use vector similarity only.

## Connection Pool Tuning

The PostgreSQL connection pool defaults are designed for moderate workloads:

- `PG_POOL_MIN=2` — minimum open connections
- `PG_POOL_MAX=80` — maximum open connections

For low-traffic deployments, reduce `PG_POOL_MAX` to 10-20. For high-traffic production, increase `PG_POOL_MIN` to match your baseline concurrency.
