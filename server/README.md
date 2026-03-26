# mem0-stack-oss server

The FastAPI application that powers mem0-stack-oss. See the [project README](../README.md) for full documentation.

## Quick start

```bash
cp .env.example .env
# Edit .env with your API keys

# With Docker
docker compose up

# Without Docker
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8090
```

Visit `http://localhost:8090/docs` for the interactive API explorer.

## Files

| File | Description |
|------|-------------|
| `main.py` | FastAPI app — all endpoints, classification pipeline, maintenance tools |
| `.env.example` | Full environment variable reference |
| `prompts/extraction.txt` | Customizable fact extraction prompt |
| `prompts/classification.txt` | Customizable classification prompt |
| `prompts/taxonomy.json` | Classification category definitions |
| `docker-compose.yaml` | Dev stack (API + PostgreSQL + Neo4j) |
| `Dockerfile` | Production image |
| `dev.Dockerfile` | Dev image with hot-reload |
