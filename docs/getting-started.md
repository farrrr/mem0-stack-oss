# Getting Started

Go from zero to a running memory API server in 5 minutes.

## Prerequisites

- **Python 3.12+**
- **PostgreSQL** with the [pgvector](https://github.com/pgvector/pgvector) extension
- **FalkorDB** (recommended) or **Neo4j** for graph memory
- An **OpenAI-compatible LLM API key** (OpenAI, Cerebras, Together, etc.)

## 1. Clone the repository

```bash
git clone https://github.com/farrrr/mem0-stack-oss.git /opt/mem0-stack
cd /opt/mem0-stack
```

## 2. Set up Python environment

```bash
python3 -m venv /opt/mem0-stack/venv
/opt/mem0-stack/venv/bin/pip install -r /opt/mem0-stack/server/requirements.txt
```

## 3. Configure environment

```bash
cd /opt/mem0-stack/server
cp .env.example .env
```

Edit `.env` with at minimum:

```bash
# Your LLM API key (required)
LLM_API_KEY=sk-your-key-here

# PostgreSQL connection
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your-password

# Graph store (FalkorDB is the default)
GRAPH_PROVIDER=falkordb
FALKORDB_HOST=localhost
FALKORDB_PORT=6379
```

If you use the same API key for embeddings, `LLM_API_KEY` is sufficient. Otherwise, set `EMBEDDER_API_KEY` separately. You can also set `OPENAI_API_KEY` as a fallback for both.

## 4. Start the server

```bash
cd /opt/mem0-stack/server
/opt/mem0-stack/venv/bin/uvicorn main:app --host 0.0.0.0 --port 8090
```

## 5. Verify it works

```bash
curl http://localhost:8090/health
```

Expected response:

```json
{"status": "ok"}
```

Visit `http://localhost:8090/docs` for the interactive OpenAPI explorer.

## 6. Add your first memory

```bash
curl -X POST http://localhost:8090/memories \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "I prefer dark mode and use VS Code as my editor."}
    ],
    "user_id": "alice"
  }'
```

Search for it:

```bash
curl -X POST http://localhost:8090/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What editor does Alice use?",
    "user_id": "alice"
  }'
```

## Optional: Next steps

### Install as a systemd service

For production, run the server as a systemd service instead of manually:

```bash
mkdir -p ~/.config/systemd/user
cp /opt/mem0-stack/systemd/mem0-api.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now mem0-api
```

See [deployment.md](deployment.md) for full details.

### Build the dashboard

```bash
cd /opt/mem0-stack/dashboard
npm install
npm run build
```

The built files go to `dashboard/dist/`. See [deployment.md](deployment.md) for serving with nginx.

### Set up TEI reranker

For better search quality, run a TEI reranker container:

```bash
docker run -d --name tei-reranker --gpus all \
  -p 127.0.0.1:8184:80 \
  ghcr.io/huggingface/text-embeddings-inference:1.7 \
  --model-id BAAI/bge-reranker-v2-m3 --dtype float16 --port 80
```

Then set in `.env`:

```bash
RERANKER_PROVIDER=tei
RERANKER_BASE_URL=http://localhost:8184
```

See [configuration.md](configuration.md) for all reranker options.
