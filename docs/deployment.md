# Deployment Guide

## systemd Deployment (Recommended for Production)

### 1. Clone and set up

```bash
git clone https://github.com/farrrr/mem0-stack-oss.git /opt/mem0-stack
cd /opt/mem0-stack
python3 -m venv /opt/mem0-stack/venv
/opt/mem0-stack/venv/bin/pip install -r /opt/mem0-stack/server/requirements.txt
```

### 2. Configure environment

```bash
cp /opt/mem0-stack/server/.env.example /opt/mem0-stack/server/.env
# Edit .env with your credentials
```

At minimum, set `LLM_API_KEY`, `POSTGRES_HOST`, `POSTGRES_PASSWORD`, and `ADMIN_API_KEY`.

### 3. Install systemd service

As a **user service** (no root required):

```bash
mkdir -p ~/.config/systemd/user
cp /opt/mem0-stack/systemd/mem0-api.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now mem0-api
```

As a **system service** (for dedicated servers):

```bash
sudo cp /opt/mem0-stack/systemd/mem0-api.service /etc/systemd/system/
# Edit /etc/systemd/system/mem0-api.service to set User= and adjust paths
sudo systemctl daemon-reload
sudo systemctl enable --now mem0-api
```

The service file expects:
- Working directory: `/opt/mem0-stack/server`
- Environment file: `/opt/mem0-stack/server/.env`
- Binary: `/opt/mem0-stack/venv/bin/uvicorn`
- Port: `8090`

### 4. Verify

```bash
curl http://localhost:8090/health
systemctl --user status mem0-api
```

### 5. View logs

```bash
# Follow logs in real time
journalctl --user -u mem0-api -f

# Last 100 lines
journalctl --user -u mem0-api -n 100

# Since last hour
journalctl --user -u mem0-api --since "1 hour ago"
```

### 6. Updating

```bash
cd /opt/mem0-stack
git pull
/opt/mem0-stack/venv/bin/pip install -r server/requirements.txt
systemctl --user restart mem0-api
```

---

## Docker Deployment

### Overview

The `server/docker-compose.yaml` provides a complete development stack:

| Service | Image | Exposed Port |
|---------|-------|-------------|
| mem0 (API) | Built from `dev.Dockerfile` | `8888` |
| postgres | `ankane/pgvector:v0.5.1` | `8432` |
| neo4j | `neo4j:5.26.4` | `8474` (HTTP), `8687` (Bolt) |

### Running

```bash
cd /opt/mem0-stack/server
cp .env.example .env
# Edit .env as needed
docker compose up -d
```

The API is available at `http://localhost:8888`. The compose file mounts the server code for hot-reload during development.

### Data persistence

Data is stored in named Docker volumes:

- `postgres_db` — PostgreSQL data
- `neo4j_data` — Neo4j graph data

To back up:

```bash
docker compose exec postgres pg_dump -U postgres postgres > backup.sql
```

### Using FalkorDB instead of Neo4j

The default compose file includes Neo4j. To use FalkorDB, add a FalkorDB service or run it separately:

```bash
docker run -d --name falkordb -p 6379:6379 falkordb/falkordb:latest
```

Set `GRAPH_PROVIDER=falkordb` and `FALKORDB_HOST=host.docker.internal` in your `.env`.

### GPU support for TEI reranker

```bash
docker run -d --name tei-reranker --gpus all \
  -p 127.0.0.1:8184:80 \
  ghcr.io/huggingface/text-embeddings-inference:1.7 \
  --model-id BAAI/bge-reranker-v2-m3 --dtype float16 --port 80
```

Without a GPU, omit `--gpus all` and use `--dtype float32`. CPU inference is slower but functional.

---

## Dashboard Deployment

### 1. Build

```bash
cd /opt/mem0-stack/dashboard
npm install
npm run build
```

Built files are output to `dashboard/dist/`.

### 2. Development mode

```bash
cd /opt/mem0-stack/dashboard
npm run dev
```

### 3. Serving with nginx

Copy built files to your web root and configure nginx as a reverse proxy:

```nginx
server {
    listen 80;
    server_name mem0.example.com;
    root /opt/mem0-stack/dashboard/dist;
    index index.html;

    # SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Reverse proxy API requests to the mem0-stack server
    location /api/ {
        proxy_pass http://127.0.0.1:8090/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 4. SSL/TLS

For production, use Let's Encrypt with certbot or place the server behind a reverse proxy (Caddy, Traefik, Cloudflare Tunnel) that handles TLS termination.

---

## OpenClaw Plugin Deployment

The OpenClaw plugin allows AI agents running on the [OpenClaw](https://github.com/openclaw) gateway to use mem0-stack-oss as their memory backend.

### 1. Sparse checkout on the remote machine

If the gateway runs on a different machine from the API server, use a sparse checkout to get only the plugin:

```bash
git clone --filter=blob:none --sparse \
  https://github.com/farrrr/mem0-stack-oss.git /opt/mem0-stack-oss
cd /opt/mem0-stack-oss
git sparse-checkout set plugins/openclaw
```

### 2. Install the plugin

```bash
cd /opt/mem0-stack-oss/plugins/openclaw
npm install
openclaw plugins install --link .
```

### 3. Configure the plugin

In the OpenClaw gateway configuration, add the plugin with these settings:

| Setting | Description | Example |
|---------|-------------|---------|
| `apiUrl` | URL of the mem0-stack-oss API server | `http://10.0.0.1:8090` |
| `apiKey` | API key (matches `ADMIN_API_KEY` on the server) | `your-api-key` |
| `identity.defaultUserId` | Default user ID for memories | `alice` |
| `identity.defaultAgentId` | Default agent ID | `my-agent` |
| `autoCapture` | Auto-store conversation context | `true` |
| `autoRecall` | Auto-inject relevant memories | `true` |
| `enableGraph` | Enable graph memory | `true` |

The plugin communicates with the API server over HTTP. Ensure the server is reachable from the gateway machine.

### 4. Restart the gateway

```bash
systemctl --user restart openclaw-gateway
```
