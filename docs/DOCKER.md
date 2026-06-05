# Docker Deployment

## Services

| Service | Image | Port | Role |
|---------|-------|------|------|
| `postgres` | postgres:16-alpine | 5432 | Primary database |
| `redis` | redis:7-alpine | 6379 | Response cache |
| `backend` | Custom (Node 20) | 3000 | API cluster |
| `frontend` | Custom (nginx) | 8080 → 80 | SPA + API proxy |

## Multi-stage builds

### Backend (`docker/backend.Dockerfile`)

1. **Builder** — installs deps, runs `tsc`, outputs `dist/`
2. **Production** — production deps only, non-root `nodejs` user, runs `cluster/primary.js`

### Frontend (`docker/frontend.Dockerfile`)

1. **Builder** — Vite production build (`VITE_API_BASE_URL=/api`)
2. **Production** — `nginx:1.27-alpine` serves static files and proxies `/api/` to `backend:3000`

See [TROUBLESHOOTING.md](TROUBLESHOOTING.md) if Docker Hub pulls fail.

## Networking

```
User → localhost:8081 (nginx)
         ├─ GET /        → static React files
         ├─ GET /api/*   → proxy → backend:3000
         └─ GET /health  → proxy → backend:3000
```

Backend connects to `postgres:5432` and `redis:6379` via Docker DNS service names.

## Health checks

- **Postgres:** `pg_isready`
- **Redis:** `redis-cli ping`
- **Backend:** `wget http://localhost:3000/health`
- **Frontend:** `wget http://localhost/`

## Volumes

`postgres_data` persists database files across container restarts.

## Commands

```bash
# Start full stack
docker compose up --build -d

# View logs
docker compose logs -f backend

# Run seed inside backend container
docker compose exec backend sh -c "cd /app && npm run db:seed -w backend"

# Tear down including volumes
docker compose down -v
```

## Kubernetes

For multi-pod deployment with HPA, Ingress, and NetworkPolicies, see **[KUBERNETES.md](KUBERNETES.md)**.

## Production checklist

- [ ] Set strong `JWT_SECRET` via env / secrets manager
- [ ] Use managed PostgreSQL with SSL (`DB_SSL=true`)
- [ ] Limit `CLUSTER_WORKERS` per container based on CPU
- [ ] Put TLS termination in front of nginx (Traefik, ALB, etc.)
- [ ] Do not expose Postgres port publicly
