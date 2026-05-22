# Enterprise Advanced App

A production-style **Node.js + TypeScript** monorepo demonstrating enterprise patterns: **cluster mode**, **worker threads**, **PostgreSQL advanced SQL**, **Redis caching**, **Docker**, and a **React + TypeScript** frontend with advanced type patterns.

## Quick start

### With Docker (recommended)

```bash
cp .env.example .env
docker compose up --build -d
docker compose exec backend node backend/dist/database/seed.js 2>/dev/null || \
  docker compose run --rm backend npm run db:seed -w backend
```

- **Frontend:** http://localhost:8081  
- **API:** http://localhost:3000/api  
- **Health:** http://localhost:3000/health  

**Login:** `admin@enterprise.local` / `Password123!`

### Local development

```bash
# Start Postgres + Redis
docker compose up postgres redis -d

npm install
npm run db:migrate
npm run db:seed
npm run dev
```

- **Frontend:** http://localhost:5173 (proxies `/api` to backend)  
- **Backend:** http://localhost:3000  

## Project structure

```
├── backend/                 # Node.js API (cluster + workers)
│   └── src/
│       ├── cluster/         # Primary process — forks workers
│       ├── workers/         # Worker Thread CPU tasks
│       ├── database/        # Pool, repos, advanced queries
│       ├── routes/          # REST API
│       └── server.ts        # Express per worker
├── frontend/                # React + Vite + TypeScript
│   └── src/
│       ├── types/           # Generics, unions, branded types
│       ├── services/        # Typed API client
│       └── pages/           # UI screens
├── database/init/           # SQL schema (Docker init + migrations)
├── docker/                  # Multi-stage Dockerfiles + nginx
├── docs/                    # Detailed architecture guides
└── docker-compose.yml
```

## Features

| Area | Features |
|------|----------|
| **Node.js** | Cluster (multi-core), Worker Threads, graceful shutdown, structured logging |
| **PostgreSQL** | CTEs, window functions, JSONB, trigram search, transactions, `FOR UPDATE` |
| **API** | JWT auth, rate limiting, helmet, Zod validation, layered architecture |
| **Cache** | Redis with graceful degradation |
| **Frontend** | Advanced TS types, generic API client, role-based UI |
| **Docker** | Multi-stage builds, health checks, nginx reverse proxy |

## CI/CD

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| [CI](.github/workflows/ci.yml) | PR / push | Build TypeScript, run DB migrations, build Docker images |
| [CD](.github/workflows/cd.yml) | `main` / tags `v*` | Push images to GitHub Container Registry (GHCR) |

Details: [docs/CI_CD.md](docs/CI_CD.md)

## Troubleshooting Docker builds

If you see `auth.docker.io` or DNS `i/o timeout`, see **[docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)** (WSL2 DNS fix).

## Documentation

- [Architecture overview](docs/ARCHITECTURE.md)
- [Cluster & Worker Threads](docs/CLUSTER_AND_WORKERS.md)
- [PostgreSQL & queries](docs/DATABASE.md)
- [Docker deployment](docs/DOCKER.md)
- [API reference](docs/API.md)
- [TypeScript patterns](docs/TYPESCRIPT.md)
- [CI/CD pipeline](docs/CI_CD.md)

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Backend cluster + frontend dev server |
| `npm run build` | Build both workspaces |
| `npm run docker:up` | Full stack in Docker |
| `npm run db:migrate` | Apply SQL migrations |
| `npm run db:seed` | Seed users & products |

## License

MIT — use freely for learning and as a starter template.
