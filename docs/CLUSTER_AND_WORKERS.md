# Cluster Mode & Worker Threads

## Cluster mode (multi-process)

Node.js runs JavaScript on a **single thread** per process. To use all CPU cores, this app uses the built-in `cluster` module.

### How it works

1. You start: `node backend/dist/cluster/primary.js`
2. The **primary** process checks `cluster.isPrimary` (true).
3. It forks N workers via `cluster.fork()`, where N = `CLUSTER_WORKERS` or CPU count.
4. Each **child** re-executes the same entry file; `cluster.isPrimary` is false.
5. Children import `server.ts` and listen on `PORT` (e.g. 3000).

### Load balancing

Node's cluster module distributes incoming TCP connections across workers using round-robin (on most platforms). Each worker has its own event loop and memory.

### Auto-restart

If a worker crashes, the primary logs the exit and forks a replacement:

```typescript
cluster.on('exit', (worker, code, signal) => {
  if (code !== 0 && !worker.exitedAfterDisconnect) {
    cluster.fork({ WORKER_ID: String(worker.id) });
  }
});
```

### Graceful shutdown

`SIGTERM` / `SIGINT` on the primary kills all workers, then exits. Each worker's `server.ts` closes the HTTP server, drains the DB pool, and disconnects Redis.

### When to use cluster vs worker threads

| Use case | Solution |
|----------|----------|
| More HTTP throughput | **Cluster** (multiple processes) |
| CPU-heavy JS (crypto, math, parsing) | **Worker Threads** |
| Blocking I/O | Async I/O (pg, redis, fs promises) — not threads |

## Worker Threads (multi-thread within a process)

Worker Threads run JavaScript in **parallel isolates** sharing no memory with the main thread (unless you use `SharedArrayBuffer`).

### Flow for `/api/analytics/compute`

1. HTTP request hits a cluster worker's Express server.
2. Route calls `runCpuTask({ task: 'primes', limit: 500000 })`.
3. Main thread spawns `cpu-intensive.worker.js` with `workerData`.
4. Worker runs sieve of Eratosthenes — CPU-bound, does not block other requests' I/O.
5. Worker posts message back; main thread responds to client and terminates the worker.

### Example tasks

- `primes` — count primes up to N (demo CPU load)
- `aggregate` — sum/min/max/avg of number arrays
- `hash` — simple string hash demo

### Why not run primes on the main thread?

A long synchronous loop **blocks the event loop** — no other requests on that worker are processed until it finishes. Worker Threads move that work off the main loop.

## Environment variables

| Variable | Default | Meaning |
|----------|---------|---------|
| `CLUSTER_WORKERS` | `auto` | Number of forked workers, or CPU count |
| `PORT` | `3000` | HTTP listen port (all workers share it) |
| `WORKER_ID` | set by primary | Identifier for logging |

## Verifying cluster in production

```bash
curl http://localhost:3000/health
# Check "worker.pid" — repeat requests; PIDs may differ (different workers)

curl http://localhost:3000/api/system/info
# Shows cluster.isPrimary, cpus, memory
```
