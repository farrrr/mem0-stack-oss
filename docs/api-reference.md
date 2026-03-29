# API Reference

Base URL: `http://localhost:8080/api` (via dashboard proxy) or `http://localhost:8090` (direct).

The interactive OpenAPI explorer is available at `{base_url}/docs`.

## Authentication

When `ADMIN_API_KEY` is set, all endpoints require the `X-API-Key` header:

```bash
curl -H "X-API-Key: your-api-key" http://localhost:8080/api/health
```

Maintenance endpoints require the `X-Maintenance-Key` header when `MAINTENANCE_API_KEY` is set.

Without these environment variables, the API runs without authentication.

---

## Health

### `GET /health`

Check if the server and memory instance are ready.

```bash
curl http://localhost:8080/api/health
```

```json
{"status": "ok"}
```

Returns `503` if the memory instance is not initialized.

---

## Memories

### `POST /memories` -- Create Memories

Extract and store memories from a conversation.

**Request body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `messages` | array | yes | List of `{role, content, name?}` message objects. |
| `user_id` | string | * | User identifier. |
| `agent_id` | string | * | Agent identifier. |
| `run_id` | string | * | Session/run identifier. |
| `metadata` | object | no | Custom metadata to attach. |
| `infer` | boolean | no | Whether to extract facts (default `true`). Set to `false` to store raw. |
| `memory_type` | string | no | Set to `"procedural_memory"` for procedural memories. |
| `prompt` | string | no | Custom prompt for procedural memory summarization. |

*At least one of `user_id`, `agent_id`, or `run_id` is required.*

```bash
curl -X POST http://localhost:8080/api/memories \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "I prefer dark mode and use VS Code."},
      {"role": "assistant", "content": "Noted!"}
    ],
    "user_id": "alice"
  }'
```

**Response:** JSON with `results` array. Each result has `id`, `memory`, `event` (`ADD`, `UPDATE`, `DELETE`, `NOOP`).

---

### `GET /memories` -- List Memories

Retrieve memories with server-side pagination and filtering.

**Query parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `user_id` | string | -- | * User identifier. |
| `agent_id` | string | -- | * Agent identifier. |
| `run_id` | string | -- | * Session identifier. |
| `app_id` | string | -- | App identifier (from metadata). |
| `limit` | int | 35 | Results per page (1-500). |
| `offset` | int | 0 | Pagination offset. |
| `category` | string | -- | Filter by classification category. |
| `confidence` | string | -- | Filter by confidence (`high`, `medium`, `low`). |
| `date_range` | string | -- | Filter by time: `1d`, `7d`, or `30d`. |
| `search` | string | -- | Text search (case-insensitive substring match). |

*At least one of `user_id`, `agent_id`, or `run_id` is required.*

```bash
curl "http://localhost:8080/api/memories?user_id=alice&limit=10&category=preference"
```

**Response:**

```json
{
  "memories": [
    {
      "id": "uuid",
      "memory": "User prefers dark mode",
      "metadata": {"category": ["preference"], "confidence": "high", ...},
      "user_id": "alice",
      "agent_id": "",
      "run_id": "",
      "created_at": "2025-01-15T10:30:00Z",
      "updated_at": "2025-01-15T10:30:00Z"
    }
  ],
  "total": 42,
  "limit": 10,
  "offset": 0
}
```

---

### `GET /memories/{memory_id}` -- Get a Memory

Retrieve a specific memory by ID.

```bash
curl http://localhost:8080/api/memories/550e8400-e29b-41d4-a716-446655440000
```

---

### `PUT /memories/{memory_id}` -- Update a Memory

Update the text of an existing memory.

**Request body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `data` | string | yes | New memory content text. |

```bash
curl -X PUT http://localhost:8080/api/memories/550e8400-e29b-41d4-a716-446655440000 \
  -H "Content-Type: application/json" \
  -d '{"data": "User prefers dark mode in all applications"}'
```

---

### `DELETE /memories/{memory_id}` -- Delete a Memory

Delete a specific memory by ID.

```bash
curl -X DELETE http://localhost:8080/api/memories/550e8400-e29b-41d4-a716-446655440000
```

```json
{"message": "Memory deleted successfully"}
```

---

### `DELETE /memories` -- Delete All Memories

Delete all memories for a given identifier.

**Query parameters:** At least one of `user_id`, `run_id`, or `agent_id`.

```bash
curl -X DELETE "http://localhost:8080/api/memories?user_id=alice"
```

---

### `GET /memories/{memory_id}/history` -- Memory History

Retrieve the change history for a memory.

```bash
curl http://localhost:8080/api/memories/550e8400-e29b-41d4-a716-446655440000/history
```

---

### `GET /memories/{memory_id}/source` -- Memory Source

Retrieve the original conversation messages that produced a memory.

```bash
curl http://localhost:8080/api/memories/550e8400-e29b-41d4-a716-446655440000/source
```

**Response:**

```json
{
  "sources": [
    {
      "messages": [
        {"role": "user", "content": "I prefer dark mode and use VS Code."}
      ],
      "created_at": "2025-01-15T10:30:00Z"
    }
  ]
}
```

---

## Search

### `POST /search` -- Search Memories

Search for memories via semantic similarity.

**Request body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `query` | string | yes | Search query text. |
| `user_id` | string | no | User identifier. |
| `run_id` | string | no | Session identifier. |
| `agent_id` | string | no | Agent identifier. |
| `filters` | object | no | Additional metadata filters. |
| `limit` | int | no | Maximum results (SDK default). |
| `threshold` | float | no | Minimum similarity score (0-1). |
| `rerank` | boolean | no | Whether to apply reranker (defaults to SDK setting). |

```bash
curl -X POST http://localhost:8080/api/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What editor does Alice use?",
    "user_id": "alice",
    "limit": 5
  }'
```

---

### `POST /search/recall` -- Combined Recall Search

Merged long-term + session memory search. Bypasses the SDK for a direct SQL UNION query with optional reranking.

**Request body:**

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `query` | string | yes | -- | Search query text. |
| `user_id` | string | yes | -- | User identifier for long-term search. |
| `agent_id` | string | no | -- | Agent identifier filter. |
| `run_id` | string | no | -- | Session ID for session memory search. |
| `limit` | int | no | 6 | Maximum results (1-100). |
| `threshold` | float | no | -- | Minimum similarity score. |
| `rerank` | boolean | no | `true` | Whether to apply reranker. |

```bash
curl -X POST http://localhost:8080/api/search/recall \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What are the user preferences?",
    "user_id": "alice",
    "run_id": "session-abc",
    "limit": 10,
    "rerank": true
  }'
```

**Response:**

```json
{
  "results": [
    {
      "id": "uuid",
      "memory": "User prefers dark mode",
      "score": 0.8921,
      "rerank_score": 0.9534,
      "metadata": {...},
      "user_id": "alice",
      "agent_id": "",
      "run_id": ""
    }
  ],
  "elapsed_seconds": 0.15
}
```

---

## Classification

### `GET /taxonomy` -- Get Taxonomy

Return the current classification taxonomy (categories and subcategories).

```bash
curl http://localhost:8080/api/taxonomy
```

---

### `POST /memories/{memory_id}/reclassify` -- Reclassify a Memory

Trigger re-classification for an existing memory. Runs in the background.

```bash
curl -X POST http://localhost:8080/api/memories/550e8400-e29b-41d4-a716-446655440000/reclassify
```

```json
{"status": "queued", "memory_id": "550e8400-e29b-41d4-a716-446655440000"}
```

---

### `POST /reclassify-all` -- Bulk Reclassify

Reclassify all memories for a user. Defaults to only unclassified memories.

**Query parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `user_id` | string | -- | Required. User ID. |
| `only_unclassified` | boolean | `true` | Only reclassify memories without a category. |

```bash
curl -X POST "http://localhost:8080/api/reclassify-all?user_id=alice&only_unclassified=true"
```

```json
{"status": "queued", "count": 15, "only_unclassified": true}
```

---

## Feedback

### `POST /memories/{memory_id}/feedback` -- Submit Feedback

Submit feedback for a memory. `very_negative` feedback auto-suppresses the memory.

**Request body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `user_id` | string | yes | User who submitted the feedback. |
| `feedback` | string | yes | `positive`, `negative`, or `very_negative`. |
| `reason` | string | no | Reason for the feedback. |

```bash
curl -X POST http://localhost:8080/api/memories/550e8400-e29b-41d4-a716-446655440000/feedback \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "alice",
    "feedback": "very_negative",
    "reason": "This memory is incorrect"
  }'
```

---

### `GET /memories/{memory_id}/feedback` -- Get Feedback

Retrieve all feedback records for a specific memory.

```bash
curl http://localhost:8080/api/memories/550e8400-e29b-41d4-a716-446655440000/feedback
```

---

### `GET /feedback/stats` -- Feedback Statistics

Feedback counts by type and recent negative feedback.

**Query parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `user_id` | string | yes | User ID to get feedback stats for. |

```bash
curl "http://localhost:8080/api/feedback/stats?user_id=alice"
```

---

## Entities

### `GET /entities` -- List Entities for a User

List agents and apps under a user with memory counts.

**Query parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `user_id` | string | yes | User ID. |

```bash
curl "http://localhost:8080/api/entities?user_id=alice"
```

---

### `GET /entities/users` -- List All Users

*Requires `X-Maintenance-Key` header.*

List all distinct user IDs with memory and agent counts.

```bash
curl http://localhost:8080/api/entities/users \
  -H "X-Maintenance-Key: your-maintenance-key"
```

---

### `GET /entities/by-type` -- List Entities by Type

*Requires `X-Maintenance-Key` header.*

List all entities of a given type with memory counts.

**Query parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `entity_type` | string | yes | `user`, `agent`, `app`, or `run`. |
| `limit` | int | no | Results per page (default 50, max 500). |
| `offset` | int | no | Pagination offset. |

```bash
curl "http://localhost:8080/api/entities/by-type?entity_type=user" \
  -H "X-Maintenance-Key: your-maintenance-key"
```

---

### `DELETE /entities/{entity_type}/{entity_id}` -- Delete Entity

*Requires `X-Maintenance-Key` header.*

Delete all memories for a user or agent entity.

**Query parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `confirm` | boolean | yes | Must be `true` to confirm deletion. |
| `user_id` | string | * | Required when deleting an agent (to scope the delete). |

```bash
curl -X DELETE "http://localhost:8080/api/entities/user/alice?confirm=true" \
  -H "X-Maintenance-Key: your-maintenance-key"
```

---

## Graph

### `GET /graph/stats` -- Graph Statistics

Graph memory statistics for a user (cached 5 minutes).

**Query parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `user_id` | string | yes | User ID. |

```bash
curl "http://localhost:8080/api/graph/stats?user_id=alice"
```

---

### `GET /graph/relations` -- List Graph Relations

List entity relationships from the user's graph.

**Query parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `user_id` | string | yes | User ID. |
| `limit` | int | no | Results per page (default 50, max 500). |
| `offset` | int | no | Pagination offset. |
| `search` | string | no | Filter relations by text. |

```bash
curl "http://localhost:8080/api/graph/relations?user_id=alice&limit=20"
```

---

### `GET /graph/neighbors` -- Get Node Neighbors

Get the neighbors of a specific node in the user's graph.

**Query parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `user_id` | string | yes | User ID. |
| `node_name` | string | yes | Name of the node to query. |

```bash
curl "http://localhost:8080/api/graph/neighbors?user_id=alice&node_name=VS%20Code"
```

---

## Statistics

### `GET /stats` -- System Statistics

Aggregated statistics: total memories, category distribution, importance, recent activity.

**Query parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `user_id` | string | yes | User ID. |
| `agent_id` | string | no | Agent ID filter. |

```bash
curl "http://localhost:8080/api/stats?user_id=alice"
```

**Response:**

```json
{
  "user_id": "alice",
  "agent_id": null,
  "total_memories": 142,
  "category_counts": {"preference": 35, "technical": 28, ...},
  "avg_importance_score": 0.7234,
  "recent_7d": {"add_count": 12, "search_count": 45, "recall_count": 30},
  "expired_count": 3,
  "low_importance_count": 8
}
```

---

## Request Logs

### `GET /requests` -- List Request Logs

List API request log entries with optional filters.

**Query parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `request_type` | string | -- | Filter by type (`ADD`, `SEARCH`, `RECALL`, `GET_ALL`). |
| `has_results` | boolean | -- | Filter by whether the request returned results. |
| `user_id` | string | -- | Filter by user ID. |
| `days` | int | -- | Filter to last N days (1-365). |
| `limit` | int | 50 | Results per page (1-500). |
| `offset` | int | 0 | Pagination offset. |

```bash
curl "http://localhost:8080/api/requests?request_type=SEARCH&days=7&limit=20"
```

---

### `GET /requests/{request_id}` -- Request Detail

Retrieve a specific API request log entry with full payload.

```bash
curl http://localhost:8080/api/requests/550e8400-e29b-41d4-a716-446655440000
```

---

### `GET /requests/daily-stats` -- Daily Request Statistics

Daily request counts for dashboard charts.

**Query parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `days` | int | 30 | Number of days to include (1-365). |
| `request_type` | string | -- | Filter by request type. |

```bash
curl "http://localhost:8080/api/requests/daily-stats?days=14"
```

---

## Maintenance

All maintenance endpoints require the `X-Maintenance-Key` header when `MAINTENANCE_API_KEY` is configured. All support `dry_run=true` (default) to preview changes.

### `POST /maintenance/decay` -- Decay Importance Scores

Apply exponential decay to importance scores based on days since last access.

**Query parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `user_id` | string | -- | Required. User ID. |
| `decay_lambda` | float | 0.01 | Decay rate. 0.01 gives ~70-day half-life. |
| `dry_run` | boolean | `true` | Preview only; do not apply changes. |

```bash
curl -X POST "http://localhost:8080/api/maintenance/decay?user_id=alice&dry_run=false&decay_lambda=0.01" \
  -H "X-Maintenance-Key: your-maintenance-key"
```

---

### `POST /maintenance/dedup` -- Semantic Deduplication

Find and remove near-duplicate memories based on cosine similarity.

**Query parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `user_id` | string | -- | Required. User ID. |
| `threshold` | float | 0.95 | Cosine similarity threshold for duplicates. |
| `dry_run` | boolean | `true` | Preview only; do not apply changes. |
| `max_memories` | int | 1000 | Maximum memories to scan (1-5000). |

```bash
curl -X POST "http://localhost:8080/api/maintenance/dedup?user_id=alice&dry_run=true&threshold=0.95" \
  -H "X-Maintenance-Key: your-maintenance-key"
```

---

### `POST /maintenance/cleanup-expired` -- Clean Up Expired Memories

Delete TTL-expired memories and optionally low-importance ones.

**Query parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `user_id` | string | -- | Required. User ID. |
| `dry_run` | boolean | `true` | Preview only; do not apply changes. |
| `include_low_importance` | boolean | `true` | Also delete memories below the importance threshold. |
| `importance_threshold` | float | 0.1 | Memories below this score are candidates for deletion. |

```bash
curl -X POST "http://localhost:8080/api/maintenance/cleanup-expired?user_id=alice&dry_run=false" \
  -H "X-Maintenance-Key: your-maintenance-key"
```

---

## Configuration

### `POST /configure` -- Hot-reload Configuration

Set memory configuration at runtime. Reinitializes the AsyncMemory instance.

```bash
curl -X POST http://localhost:8080/api/configure \
  -H "Content-Type: application/json" \
  -d '{"llm": {"provider": "openai", "config": {"model": "gpt-4.1-nano"}}}'
```

---

### `POST /reset` -- Reset All Memories

Completely reset all stored memories. Use with extreme caution.

```bash
curl -X POST http://localhost:8080/api/reset
```

```json
{"message": "All memories reset"}
```
