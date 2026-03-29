# OpenClaw Mem0 Plugin

Memory plugin for [OpenClaw](https://openclaw.ai) that connects to a self-hosted [mem0-stack-oss](../../) API server. Gives AI agents persistent long-term memory with automatic capture, recall, and 8 memory tools.

## Features

- **8 memory tools**: search, store, get, update, list, forget, history, feedback
- **Auto-recall**: Injects relevant memories before each agent turn
- **Auto-capture**: Stores key facts after each turn (fire-and-forget)
- **Identity resolution**: Per-user/agent/app memory isolation with mapping support
- **Noise filtering**: Skips heartbeats, trivial responses, and system metadata (bilingual EN + zh-TW)
- **Session + long-term scoping**: Separate session and persistent memory via combined recall
- **Graph memory**: Entity relationship extraction and storage

## Installation

### 1. Install dependencies

```bash
cd plugins/openclaw
npm install
```

### 2. Link the plugin

```bash
openclaw plugins install --link .
```

### 3. Configure

Add the plugin to your OpenClaw gateway configuration:

```json
{
  "plugins": {
    "openclaw-mem0": {
      "apiUrl": "http://localhost:8090",
      "apiKey": "your-api-key",
      "identity": {
        "defaultUserId": "your-user-id",
        "defaultAgentId": "your-agent-id",
        "appId": "openclaw"
      },
      "autoRecall": true,
      "autoCapture": true,
      "enableGraph": true,
      "searchThreshold": 0.3,
      "topK": 6
    }
  }
}
```

### 4. Restart the gateway

```bash
systemctl --user restart openclaw-gateway
```

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `apiUrl` | string | required | URL of the mem0-stack-oss API server. |
| `apiKey` | string | -- | API key for authentication. Supports `${MEM0_API_KEY}` env var syntax. |
| `identity` | object | -- | Identity configuration (see below). |
| `autoCapture` | boolean | `true` | Automatically store facts after agent turns. |
| `autoRecall` | boolean | `true` | Automatically inject memories before agent turns. |
| `enableGraph` | boolean | `true` | Enable graph memory for entity relationships. |
| `customInstructions` | string | -- | Natural language rules for what to store or exclude. |
| `searchThreshold` | number | `0.3` | Minimum similarity score for search results (0-1). |
| `topK` | number | `6` | Maximum number of memories to retrieve. |

### Identity Configuration

The identity object maps OpenClaw users and agents to mem0 entity IDs:

```json
{
  "defaultUserId": "far",
  "defaultAgentId": "rei",
  "appId": "openclaw",
  "agentMapping": { "main": "rei" },
  "userMapping": {}
}
```

| Field | Description |
|-------|-------------|
| `defaultUserId` | Default user_id when no mapping matches. |
| `defaultAgentId` | Default agent_id when no mapping matches. |
| `appId` | Application identifier stored in memory metadata. |
| `userMapping` | Map OpenClaw user identifiers to mem0 user IDs. |
| `agentMapping` | Map OpenClaw agent identifiers to mem0 agent IDs. |

## How It Works

### Auto-Recall (before each agent turn)

1. The plugin intercepts the incoming user message.
2. It calls `POST /search/recall` on the mem0 API with the message text and user context.
3. Relevant memories are injected into the agent's system prompt.
4. The agent processes the message with full memory context.

### Auto-Capture (after each agent turn)

1. The plugin captures the conversation exchange (user message + agent response).
2. Noise filtering checks whether the exchange contains meaningful content.
3. If it passes filtering, the plugin calls `POST /memories` to store the exchange.
4. The mem0 server extracts facts, stores embeddings, and triggers classification.

### Noise Filtering

The plugin includes bilingual (English + Traditional Chinese) filters that skip:

- Trivial greetings and acknowledgments
- System heartbeat messages
- Empty or very short responses
- Metadata-only messages

### Memory Tools

Eight tools are exposed to the agent:

| Tool | Description |
|------|-------------|
| `mem0_search` | Search for relevant memories |
| `mem0_store` | Store a new memory |
| `mem0_get` | Get a specific memory by ID |
| `mem0_update` | Update an existing memory |
| `mem0_list` | List all memories for the current user |
| `mem0_forget` | Delete a specific memory |
| `mem0_history` | View change history for a memory |
| `mem0_feedback` | Submit feedback on a memory |

## Architecture

```
Plugin (OpenClaw Gateway)
  |
  +-- POST /memories       --> mem0-stack-oss API
  +-- POST /search/recall  --> mem0-stack-oss API (combined search)
  +-- POST /search         --> mem0-stack-oss API
  +-- GET  /memories       --> mem0-stack-oss API
  +-- GET  /memories/:id   --> mem0-stack-oss API
  +-- PUT  /memories/:id   --> mem0-stack-oss API
  +-- DELETE /memories/:id --> mem0-stack-oss API
  +-- GET  /memories/:id/history  --> mem0-stack-oss API
  +-- POST /memories/:id/feedback --> mem0-stack-oss API
  +-- GET  /stats          --> mem0-stack-oss API
  +-- GET  /entities       --> mem0-stack-oss API
```

## Environment Variables

You can use a `.env` file in the plugin directory:

```bash
# mem0-stack-oss API URL (required)
MEM0_API_URL=http://localhost:8090

# Optional API key
# MEM0_API_KEY=your-api-key
```

## Development

```bash
npm run typecheck   # Type check
npm run build       # Build with tsup
npm test            # Run tests with vitest
```

## Source Files

| File | Purpose |
|------|---------|
| `src/index.ts` | Plugin entry point and registration |
| `src/providers.ts` | HTTP client for the mem0 API |
| `src/hooks.ts` | autoRecall and autoCapture hooks |
| `src/tools.ts` | 8 memory tools exposed to agents |
| `src/filtering.ts` | Bilingual noise filtering |
| `src/identity.ts` | User/agent identity mapping |
| `src/config.ts` | Configuration parsing |
| `src/types.ts` | TypeScript interfaces |
