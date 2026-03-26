# REST API Server

> Reach every Mem0 OSS capability through a FastAPI-powered REST layer.

The Mem0 REST API server exposes every OSS memory operation over HTTP. Run it alongside your stack to add, search, update, and delete memories from any language that speaks REST.

> **You'll use this when...**
> - Your services already talk to REST APIs and you want Mem0 to match that style.
> - Teams on languages without the Mem0 SDK still need access to memories.
> - You plan to explore or debug endpoints through the built-in OpenAPI page at `/docs`.

> **Warning:** Enable API key authentication (see below) and HTTPS before exposing the server to anything beyond your internal network.

---

## Features

- **CRUD endpoints:** Create, retrieve, search, update, delete, and reset memories by `user_id`, `agent_id`, or `run_id`.
- **API key authentication:** Optionally secure all endpoints with a shared API key via the `X-API-Key` header.
- **Status health check:** Access base routes to confirm the server is online.
- **OpenAPI explorer:** Visit `/docs` for interactive testing and schema reference.

---

## Configure it

### Run with Docker Compose (development)

1. Create `server/.env` with your keys:

```bash
OPENAI_API_KEY=your-openai-api-key
```

2. Start the stack:

```bash
cd server
docker compose up
```

3. Reach the API at `http://localhost:8888`. Edits to the server or library auto-reload.

### Run with Docker

**Pull image:**

```bash
docker pull mem0/mem0-api-server
```

**Or build locally:**

```bash
docker build -t mem0-api-server .
```

1. Create a `.env` file with `OPENAI_API_KEY`.
2. Run the container:

```bash
docker run -p 8000:8000 --env-file .env mem0-api-server
```

3. Visit `http://localhost:8000`.

### Run directly (no Docker)

```bash
pip install -r requirements.txt
uvicorn main:app --reload
```

> **Tip:** Use a process manager such as `systemd`, Supervisor, or PM2 when deploying the FastAPI server for production resilience.

> **Note:** The REST server reads the same configuration you use locally, so you can point it at your preferred LLM, vector store, graph backend, and reranker without changing code.

---

## Authentication

The server supports optional API key authentication. When the `ADMIN_API_KEY` environment variable is set, every endpoint requires a valid `X-API-Key` header. The `/` redirect, `/docs`, and `/openapi.json` routes remain open so you can always reach the interactive API explorer.

| `ADMIN_API_KEY` value | Behavior |
|---|---|
| Not set / empty | All endpoints are open (no auth) |
| Any non-empty string | Requests must include `X-API-Key: <your-key>` |

### Enable authentication

Add the key to your `.env` file:

```bash
ADMIN_API_KEY=your-secret-api-key
```

Then include the header in every request:

```bash
curl -X POST http://localhost:8000/memories \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-secret-api-key" \
  -d '{
    "messages": [{"role": "user", "content": "I love pizza."}],
    "user_id": "alice"
  }'
```

> **Warning:** The server logs a warning at startup when `ADMIN_API_KEY` is not set. Always set it in production.

---

## See it in action

### Create and search memories via HTTP

```bash
curl -X POST http://localhost:8000/memories \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "I love fresh vegetable pizza."}
    ],
    "user_id": "alice"
  }'
```

Expect a JSON response containing the new memory IDs and events (`ADD`, etc.).

```bash
curl "http://localhost:8000/memories/search?user_id=alice&query=vegetable"
```

### Explore with OpenAPI docs

1. Navigate to `http://localhost:8000/docs`.
2. Pick an endpoint (e.g., `POST /memories/search`).
3. Fill in parameters and click **Execute** to try requests in-browser.

> **Tip:** Export the generated `curl` snippets from the OpenAPI UI to bootstrap integration tests.

---

## Verify the feature is working

- Hit the root route and `/docs` to confirm the server is reachable.
- Run a full cycle: `POST /memories` → `GET /memories/{id}` → `DELETE /memories/{id}`.
- Watch server logs for import errors or provider misconfigurations during startup.
- Confirm environment variables (API keys, vector store credentials) load correctly when containers restart.

---

## Best practices

1. **Enable authentication:** Set `ADMIN_API_KEY` to secure all endpoints, or use an API gateway for more advanced schemes.
2. **Use HTTPS:** Terminate TLS at your load balancer or reverse proxy.
3. **Monitor uptime:** Track request rates, latency, and error codes per endpoint.
4. **Version configs:** Keep environment files and Docker Compose definitions in source control.
5. **Limit exposure:** Bind to private networks unless you explicitly need public access.
