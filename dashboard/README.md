# mem0-stack-oss Dashboard

React web UI for managing and visualizing memories. Communicates with the mem0-stack-oss API server via `/api/*` reverse proxy.

## Tech Stack

| Technology | Purpose |
|-----------|---------|
| React 19 | UI framework |
| TypeScript | Type safety |
| Vite 8 | Build tool and dev server |
| Tailwind CSS 4 | Styling |
| TanStack Query 5 | Data fetching and caching |
| react-router-dom 7 | Client-side routing |
| react-force-graph-2d | Graph visualization |
| react-i18next + i18next | Internationalization |
| Lucide React | Icons |

## Development Setup

### Prerequisites

- Node.js 22+
- The mem0-stack-oss API server running on port 8090

### Install and run

```bash
npm install
npm run dev
```

The dev server starts on `http://localhost:5173`. Vite proxies `/api/*` requests to `http://localhost:8090` (configured in `vite.config.ts`).

### Build for production

```bash
npm run build
```

Output goes to `dist/`. Serve these files with any static file server (nginx, Caddy, etc.).

### Type check and lint

```bash
npx tsc -b          # Type check
npm run lint         # ESLint
```

## Pages

| Page | Route | Description |
|------|-------|-------------|
| Dashboard | `/` | Overview with memory stats, activity charts, and category distribution |
| Memories | `/memories` | Memory browser with pagination, filtering by category/confidence/date, and text search |
| Search | `/search` | Interactive memory search with similarity scores |
| Entities | `/entities` | User and agent entity management with memory counts |
| Graph | `/graph` | Force-directed graph visualization of entity relationships |
| Stats | `/stats` | Detailed system statistics per user |
| Requests | `/requests` | API request audit log with filters |
| Maintenance | `/maintenance` | Decay, dedup, and cleanup tools with dry-run preview |
| Health | `/health` | Service health status checks |
| Login | `/login` | API key authentication |

## Internationalization (i18n)

The dashboard supports three languages:

| Language | File |
|----------|------|
| English | `src/pages/locales/en.json` |
| Traditional Chinese (zh-TW) | `src/pages/locales/zh-TW.json` |
| Simplified Chinese (zh-CN) | `src/pages/locales/zh-CN.json` |

Language detection is automatic based on browser locale. You can switch languages from the UI.

To add a new language, create a new JSON file in `src/pages/locales/` following the structure of `en.json`.

## API Proxy

In development, Vite proxies `/api/*` to `http://localhost:8090` with prefix stripping (a request to `/api/health` becomes `/health` on the server).

In production (Docker), nginx handles the same proxy. See `Dockerfile` for the nginx template.

## Docker

The `Dockerfile` uses a multi-stage build:

1. **Build stage**: Node.js 22 Alpine -- `npm ci` + `npm run build`
2. **Serve stage**: nginx Alpine -- serves `dist/` with SPA fallback and API proxy

The `API_UPSTREAM` environment variable controls where nginx proxies `/api/*` requests. Docker Compose sets this to `api:8000`.

## Project Structure

```
dashboard/
├── src/
│   ├── pages/           # Page components (one per route)
│   │   ├── locales/     # i18n translation files
│   │   └── *.tsx        # Page components
│   ├── components/      # Shared UI components
│   ├── contexts/        # React contexts
│   ├── hooks/           # Custom hooks
│   ├── lib/             # API client, types, utilities
│   ├── App.tsx          # Router and layout
│   ├── main.tsx         # Entry point
│   └── index.css        # Global styles (Tailwind)
├── public/              # Static assets
├── Dockerfile           # Multi-stage build
├── vite.config.ts       # Vite config with API proxy
├── tsconfig.json        # TypeScript config
└── package.json
```
