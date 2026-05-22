# Troubleshooting

## Docker build: `auth.docker.io` / DNS timeout

### Symptom

```
failed to fetch oauth token: Post "https://auth.docker.io/token"
dial tcp: lookup auth.docker.io on 10.255.255.254:53: i/o timeout
```

Docker cannot resolve or reach Docker Hub. This is a **network/DNS** issue on your machine (common on WSL2), not an application bug.

### Fix 1 — WSL2 DNS (most common)

1. Edit Windows `C:\Users\<You>\.wslconfig`:

```ini
[wsl2]
dnsTunneling=false
networkingMode=mirrored
```

Or disable auto-generated resolv.conf:

```ini
[network]
generateResolvConf = false
```

2. In WSL, set DNS manually:

```bash
sudo rm -f /etc/resolv.conf
printf 'nameserver 8.8.8.8\nnameserver 1.1.1.1\n' | sudo tee /etc/resolv.conf
sudo chattr +i /etc/resolv.conf 2>/dev/null || true
```

3. Restart WSL from PowerShell:

```powershell
wsl --shutdown
```

4. Restart Docker Desktop, then test:

```bash
docker pull node:20-alpine
docker pull postgres:16-alpine
```

### Fix 2 — Docker Desktop DNS

Docker Desktop → **Settings** → **Docker Engine**, add:

```json
{
  "dns": ["8.8.8.8", "1.1.1.1"]
}
```

Apply & restart.

### Fix 3 — VPN / corporate proxy

- Disconnect VPN and retry `docker compose build`.
- If behind a proxy, configure Docker Desktop proxy settings.
- Some networks block `registry-1.docker.io`.

### Fix 4 — Run without building images

If pulls work later but builds are slow, pre-pull images:

```bash
docker pull node:20-alpine
docker pull postgres:16-alpine
docker pull redis:7-alpine
docker compose build
```

### Run app without Docker (when Hub is unreachable)

```bash
# Only DB in Docker (if postgres/redis images already cached)
docker compose up postgres redis -d

# On host (requires Node 20+)
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

- Frontend: http://localhost:5173  
- API: http://localhost:3000  

## Port already allocated

Change host ports in `docker-compose.yml`:

| Service  | Default | Alternative |
|----------|---------|-------------|
| Postgres | 5433    | 5434        |
| Redis    | 6380    | 6381        |
| Backend  | 3000    | 3001        |
| Frontend | 8081    | 8082        |

## Frontend uses nginx

The production frontend image is `nginx:1.27-alpine`. If the build fails on pulling nginx, fix DNS first (above), then run:

```bash
docker pull nginx:1.27-alpine
docker compose build frontend
```
