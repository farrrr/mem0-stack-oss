# OpenClaw Mem0 Plugin (mem0-stack-oss)

Memory plugin for [OpenClaw](https://openclaw.ai) that connects to a self-hosted [mem0-stack-oss](../../server/) API server.

## Features

- **8 memory tools**: search, store, get, update, list, forget, history, feedback
- **Auto-recall**: Injects relevant memories before each agent turn
- **Auto-capture**: Stores key facts after each turn (fire-and-forget)
- **Identity resolution**: Per-user/agent/app memory isolation with mapping support
- **Noise filtering**: Skips heartbeats, trivial responses, system metadata
- **Session + long-term scoping**: Separate session and persistent memory
- **CLI**: `openclaw mem0 search`, `openclaw mem0 stats`, `openclaw mem0 entities`

## Setup

1. Install dependencies:

```bash
npm install
```

2. Configure in your OpenClaw config:

```json
{
  "plugins": {
    "openclaw-mem0": {
      "apiUrl": "http://localhost:8090",
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

## Config Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `apiUrl` | string | required | URL of the mem0-stack-oss API server |
| `apiKey` | string | - | Optional API key (supports `${MEM0_API_KEY}` syntax) |
| `identity` | object | - | Identity configuration (see below) |
| `autoCapture` | boolean | true | Auto-store facts after agent turns |
| `autoRecall` | boolean | true | Auto-inject memories before agent turns |
| `enableGraph` | boolean | true | Enable graph memory for relationships |
| `customInstructions` | string | - | Custom extraction instructions |
| `searchThreshold` | number | 0.3 | Minimum similarity score (0-1) |
| `topK` | number | 6 | Maximum memories to retrieve |

### Identity Config

```json
{
  "defaultUserId": "far",
  "defaultAgentId": "rei",
  "appId": "openclaw",
  "agentMapping": { "main": "rei" },
  "userMapping": {}
}
```

## Architecture

```
Plugin (OpenClaw Gateway)
  |
  +-- POST /memories       --> mem0-stack-oss API
  +-- POST /search         --> mem0-stack-oss API
  +-- POST /search/recall  --> mem0-stack-oss API (combined search)
  +-- GET  /memories       --> mem0-stack-oss API
  +-- GET  /memories/:id   --> mem0-stack-oss API
  +-- PUT  /memories/:id   --> mem0-stack-oss API
  +-- DELETE /memories/:id --> mem0-stack-oss API
  +-- GET  /memories/:id/history  --> mem0-stack-oss API
  +-- POST /memories/:id/feedback --> mem0-stack-oss API
  +-- GET  /stats          --> mem0-stack-oss API
  +-- GET  /entities       --> mem0-stack-oss API
```

## Development

```bash
npm run typecheck   # Type check
npm run build       # Build with tsup
npm test            # Run tests
```
