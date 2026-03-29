# Getting Started

Go from zero to a running memory API in 5 minutes.

## Prerequisites

- **Docker** and **Docker Compose** (v2+)
- An **OpenAI-compatible LLM API key** (OpenAI, Cerebras, Together, Groq, etc.)

That's it. Docker Compose handles PostgreSQL, FalkorDB, the API server, and the dashboard.

> For a non-Docker setup, see [Deployment](deployment.md).

## 1. Clone the Repository

```bash
git clone https://github.com/farrrr/mem0-stack-oss.git
cd mem0-stack-oss
```

## 2. Configure Environment

```bash
cp .env.example .env
```

Open `.env` and set the two required values:

```bash
OPENAI_API_KEY=sk-your-openai-key
PG_PASSWORD=change-me-in-production
```

These are the only required settings. The defaults work out of the box for everything else. See [Configuration](configuration.md) for the full variable reference.

## 3. Start the Stack

```bash
docker compose up -d
```

This starts four services:

| Service | Description |
|---------|-------------|
| `postgres` | PostgreSQL 16 with pgvector |
| `falkordb` | FalkorDB for graph memory |
| `api` | FastAPI server (mem0 API) |
| `dashboard` | nginx serving React frontend + API proxy |

## 4. Verify

```bash
curl http://localhost:8080/api/health
```

Expected response:

```json
{"status": "ok"}
```

Open `http://localhost:8080` in your browser to see the dashboard.

The API server also exposes an interactive OpenAPI explorer at `http://localhost:8080/api/docs`.

## 5. Add Your First Memory

Store a memory for a user named "alice":

```bash
curl -X POST http://localhost:8080/api/memories \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "I prefer dark mode and use VS Code as my editor."},
      {"role": "assistant", "content": "Got it! I will remember your preferences."}
    ],
    "user_id": "alice"
  }'
```

The server extracts facts from the conversation (e.g., "Alice prefers dark mode", "Alice uses VS Code") and stores them as separate memories. A background task classifies each memory into a category.

## 6. Search Memories

```bash
curl -X POST http://localhost:8080/api/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What editor does Alice use?",
    "user_id": "alice"
  }'
```

You receive a list of memories ranked by relevance, each with a similarity score.

## 7. List All Memories

```bash
curl "http://localhost:8080/api/memories?user_id=alice"
```

This returns paginated results with metadata, classification, and timestamps.

## Next Steps

- **Secure the API**: Set `ADMIN_API_KEY` in your `.env` to require authentication on all endpoints.
- **Enable the reranker**: Add `--profile gpu` to improve search quality. See [Configuration](configuration.md#reranker-optional).
- **Customize extraction**: Edit `server/prompts/extraction.txt` to control what facts the LLM extracts.
- **Deploy to production**: See [Deployment](deployment.md) for systemd, SSL, and backup instructions.
- **Explore the API**: See [API Reference](api-reference.md) for every endpoint with curl examples.
- **Connect an AI agent**: Install the [OpenClaw plugin](../plugins/openclaw/README.md) for automatic memory capture and recall.
