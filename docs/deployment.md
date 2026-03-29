# Deployment Guide

## Docker Compose (Recommended)

The root `compose.yaml` provides a complete production-ready stack.

### Overview

| Service | Image | Internal Port | Host Port |
|---------|-------|---------------|-----------|
| `postgres` | `pgvector/pgvector:pg16` | 5432 | 5432 (localhost only) |
| `falkordb` | `falkordb/falkordb:latest` | 6379 | 6379 (localhost only) |
| `api` | Built from `server/Dockerfile` | 8000 | *(internal only)* |
| `dashboard` | Built from `dashboard/Dockerfile` | 80 | 8080 |
| `reranker` | `ghcr.io/huggingface/text-embeddings-inference:1.7` | 80 | 8184 (localhost only) |

### Step-by-step

1. **Clone and configure:**

```bash
git clone https://github.com/farrrr/mem0-stack-oss.git
cd mem0-stack-oss
cp .env.example .env
```

2. **Edit `.env`** with at minimum:

```bash
OPENAI_API_KEY=sk-your-key
PG_PASSWORD=a-strong-password
```

3. **Start the stack:**

```bash
docker compose up -d
```

4. **Verify:**

```bash
docker compose ps
curl http://localhost:8080/api/health
```

5. **View logs:**

```bash
# All services
docker compose logs -f

# API server only
docker compose logs -f api
```

### Data Persistence

Data is stored in named Docker volumes:

| Volume | Contents |
|--------|----------|
| `pgdata` | PostgreSQL data (memories, metadata, audit logs) |
| `falkordb_data` | FalkorDB graph data |
| `api_history` | SQLite history database |

To list volumes:

```bash
docker volume ls | grep mem0
```

### Backup

**PostgreSQL:**

```bash
docker compose exec postgres pg_dump -U mem0 mem0 > backup_$(date +%Y%m%d).sql
```

**Restore:**

```bash
docker compose exec -T postgres psql -U mem0 mem0 < backup_20250101.sql
```

**FalkorDB:**

FalkorDB persists data via RDB snapshots and AOF (configured in `compose.yaml`). To create a manual snapshot:

```bash
docker compose exec falkordb redis-cli BGSAVE
```

Copy the dump file from the volume:

```bash
docker cp $(docker compose ps -q falkordb):/var/lib/falkordb/data/dump.rdb ./falkordb_backup.rdb
```

### Updating

```bash
cd mem0-stack-oss
git pull
docker compose build
docker compose up -d
```

## GPU Reranker Setup

The TEI reranker improves search quality with a cross-encoder model. It requires an NVIDIA GPU.

### With Docker Compose

```bash
docker compose --profile gpu up -d
```

Then set in `.env`:

```bash
RERANKER_PROVIDER=tei
RERANKER_BASE_URL=http://reranker:80
```

### Standalone

```bash
docker run -d --name tei-reranker \
  --gpus all \
  --restart unless-stopped \
  -p 127.0.0.1:8184:80 \
  ghcr.io/huggingface/text-embeddings-inference:1.7 \
  --model-id BAAI/bge-reranker-v2-m3 --dtype float16 --port 80
```

Set in `.env`:

```bash
RERANKER_PROVIDER=tei
RERANKER_BASE_URL=http://localhost:8184
```

### CPU Fallback

Without a GPU, omit `--gpus all` and change `--dtype float16` to `--dtype float32`. CPU inference is slower but functional.

## systemd Deployment (Without Docker)

For environments where you run PostgreSQL and FalkorDB separately (e.g., managed databases), you can deploy the API server directly.

### Prerequisites

- Python 3.12+
- PostgreSQL with pgvector extension
- FalkorDB (or Neo4j)

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

**User service** (no root required):

```bash
mkdir -p ~/.config/systemd/user
cp /opt/mem0-stack/systemd/mem0-api.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now mem0-api
```

**System service** (for dedicated servers):

```bash
sudo cp /opt/mem0-stack/systemd/mem0-api.service /etc/systemd/system/
# Edit /etc/systemd/system/mem0-api.service: set User= and adjust paths
sudo systemctl daemon-reload
sudo systemctl enable --now mem0-api
```

### 4. Verify

```bash
curl http://localhost:8090/health
systemctl --user status mem0-api
```

### 5. View logs

```bash
journalctl --user -u mem0-api -f           # Follow live
journalctl --user -u mem0-api -n 100       # Last 100 lines
journalctl --user -u mem0-api --since "1h ago"  # Since last hour
```

### 6. Updating

```bash
cd /opt/mem0-stack
git pull
/opt/mem0-stack/venv/bin/pip install -r server/requirements.txt
systemctl --user restart mem0-api
```

## Dashboard Deployment

### Docker Compose (included)

When you use `docker compose up -d`, the dashboard is built and served automatically on port 8080. nginx proxies `/api/*` requests to the API server.

### Standalone Build

```bash
cd /opt/mem0-stack/dashboard
npm install
npm run build
```

Built files are output to `dashboard/dist/`.

### Serving with nginx

Copy the built files to your web root and configure nginx:

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

    # No-cache for index.html (so users get the latest build)
    location = /index.html {
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }

    # Reverse proxy API requests
    location /api/ {
        proxy_pass http://127.0.0.1:8090/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }
}
```

Note: the `/api/` location strips the prefix when proxying. A request to `/api/health` becomes `/health` on the API server.

## SSL/TLS with Reverse Proxy

For production, terminate TLS at a reverse proxy in front of the dashboard.

### Option A: Let's Encrypt with certbot

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d mem0.example.com
```

### Option B: Caddy (automatic HTTPS)

```
mem0.example.com {
    root * /opt/mem0-stack/dashboard/dist
    file_server
    try_files {path} /index.html

    handle_path /api/* {
        reverse_proxy localhost:8090
    }
}
```

### Option C: Cloudflare Tunnel

Use `cloudflared` to expose the dashboard without opening firewall ports.

## OpenClaw Plugin Deployment

Deploy the OpenClaw plugin on the machine running the OpenClaw gateway.

### 1. Sparse checkout (if API server is on a different machine)

```bash
git clone --filter=blob:none --sparse \
  https://github.com/farrrr/mem0-stack-oss.git /opt/mem0-stack-oss
cd /opt/mem0-stack-oss
git sparse-checkout set plugins/openclaw
```

### 2. Install

```bash
cd /opt/mem0-stack-oss/plugins/openclaw
npm install
openclaw plugins install --link .
```

### 3. Configure

Add the plugin to your OpenClaw gateway configuration with at minimum:

- `apiUrl`: URL of the mem0-stack-oss API server (e.g., `http://10.0.0.1:8090`)
- `apiKey`: Matches `ADMIN_API_KEY` on the server
- `identity.defaultUserId`: Default user ID for memories

### 4. Restart the gateway

```bash
systemctl --user restart openclaw-gateway
```

## Maintenance Automation

Schedule maintenance tasks with cron to keep memory quality high:

```bash
# Daily: decay importance scores
0 3 * * * curl -X POST "http://localhost:8090/maintenance/decay?user_id=alice&dry_run=false" \
  -H "X-Maintenance-Key: your-maintenance-key"

# Weekly: deduplicate similar memories
0 4 * * 0 curl -X POST "http://localhost:8090/maintenance/dedup?user_id=alice&dry_run=false" \
  -H "X-Maintenance-Key: your-maintenance-key"

# Weekly: clean up expired and low-importance memories
0 5 * * 0 curl -X POST "http://localhost:8090/maintenance/cleanup-expired?user_id=alice&dry_run=false" \
  -H "X-Maintenance-Key: your-maintenance-key"
```

Run with `dry_run=true` first to preview what will be affected.
