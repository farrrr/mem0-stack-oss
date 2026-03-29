# mem0-stack-oss Server

The FastAPI application that powers mem0-stack-oss. See the [project README](../README.md) for full documentation.

## Development Setup (Without Docker)

### Prerequisites

- Python 3.12+
- PostgreSQL with [pgvector](https://github.com/pgvector/pgvector) extension
- FalkorDB (or Neo4j) for graph memory
- An OpenAI-compatible API key

### Install and run

```bash
# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Configure
cp .env.example .env
# Edit .env with your API keys and database credentials

# Start the server
uvicorn main:app --host 0.0.0.0 --port 8090 --reload
```

Visit `http://localhost:8090/docs` for the interactive OpenAPI explorer.

### Running tests

```bash
curl http://localhost:8090/health
# {"status": "ok"}
```

## Environment Variables

See [`.env.example`](.env.example) for the complete reference with defaults and descriptions, or read the [Configuration docs](../docs/configuration.md).

### Quick reference

| Variable | Required | Description |
|----------|----------|-------------|
| `LLM_API_KEY` | yes | LLM API key (falls back to `OPENAI_API_KEY`) |
| `POSTGRES_HOST` | yes | PostgreSQL host |
| `POSTGRES_PASSWORD` | yes | PostgreSQL password |
| `GRAPH_PROVIDER` | no | `falkordb` (default) or `neo4j` |
| `RERANKER_PROVIDER` | no | `tei`, `huggingface`, or empty |
| `CLASSIFY_ENABLED` | no | `true` (default) to auto-classify memories |
| `ADMIN_API_KEY` | no | Set to enable API key authentication |
| `MAINTENANCE_API_KEY` | no | Set to protect maintenance endpoints |

## Custom Prompts

The `prompts/` directory contains customizable LLM templates:

| File | Purpose | Placeholders |
|------|---------|-------------|
| `extraction.txt` | Fact extraction from conversations | `{date}` -- current date |
| `classification.txt` | Memory classification | `{taxonomy}`, `{memory_text}` |
| `taxonomy.json` | Category and subcategory definitions | -- |

To customize extraction behavior, edit `extraction.txt`. The `{date}` placeholder is replaced by the SDK at runtime.

To change classification categories, edit `taxonomy.json`. The LLM uses these categories when tagging memories.

You can mount custom prompts into the Docker container:

```yaml
# In compose.yaml, the prompts directory is already mounted:
volumes:
  - ./server/prompts:/app/prompts:ro
```

## Files

| File | Description |
|------|-------------|
| `main.py` | FastAPI app -- all endpoints, classification pipeline, maintenance tools |
| `.env.example` | Full environment variable reference |
| `prompts/extraction.txt` | Customizable fact extraction prompt |
| `prompts/classification.txt` | Customizable classification prompt |
| `prompts/taxonomy.json` | Classification category definitions |
| `requirements.txt` | Python dependencies |
| `Dockerfile` | Production container image |
