# Load test results

Measured on **2026-08-26**. Every number here was produced by the scripts in
this directory against the real stack. Nothing is estimated unless it says so.

## Test machine — read this before quoting any number

| | |
| --- | --- |
| Host | Apple Silicon laptop, 12 cores, 16 GB RAM |
| Database | TimescaleDB 2.17 / PG17 in **Docker Desktop for macOS** |
| Load generator | Same machine as the server |

Two consequences that limit what this can prove:

1. **The load generator competes with the server for CPU.** Every result is a
   floor, not a ceiling.
2. **Docker Desktop on macOS virtualises disk I/O**, and it is noisy: identical
   write benchmarks varied by ±40% between runs. Treat write throughput as an
   order of magnitude, not a number.

Re-running on the deployment target is required before any of this is used for
capacity planning.

---

## Test 1 — WebSocket connection scale

```bash
node loadtest/ws-soak.mjs --connections 15000 --hold 20 --concurrency 250
```

| Sockets | Failures | Ramp | Open p50 / p95 / p99 | Server RSS | Marginal per socket |
| ---: | ---: | ---: | --- | --- | ---: |
| 1,000 | 0 | 1.5 s | 95 / 153 / 156 ms | 57 → 115 MB | 59 KB |
| 5,000 | 0 | 4.7 s | 125 / 184 / 232 ms | 154 → 241 MB | 18 KB |
| 15,000 | 0 | 13.5 s | 177 / 272 / 346 ms | 151 → 343 MB | **13 KB** |

Per-socket cost falls as fixed process overhead amortises; 13 KB is the honest
marginal figure. Connections were established at ~1,100/s with zero failures and
no database pool contention.

### We did not find the server's ceiling

A run at 20,000 stalled at **16,333** sockets. That is not a server limit:

```
net.inet.ip.portrange.first = 49152
net.inet.ip.portrange.last  = 65535   →  16,384 ephemeral ports
```

macOS gives a single client process 16,384 ephemeral ports to one destination,
and we used all of them. **The load generator ran out of ports, not the server
out of capacity.** Going further needs multiple load-generator hosts, or a wider
`portrange`, or the server bound on several ports.

### Extrapolation, and why it is not the whole story

At 13 KB marginal, a 3 GB instance would hold ~240,000 sockets on memory alone —
implying ~5 instances for 1,000,000 concurrent users. **Do not use that number.**
These sockets were idle apart from heartbeats. Memory is not the binding
constraint; CPU under real telemetry is, and this test did not measure it. The
README's estimate of **16–24 instances** remains the one to plan against: it is
consistent with these measurements and leaves headroom for the work each socket
actually does.

---

## Test 2 — Telemetry write path

This is the number the whole scale story depends on. The design projects
**~133,000 rows/second** at 1M concurrent users.

The gateway caps ingest at one frame per second per socket, so saturating this
from the WebSocket side would need ~133k sockets — impossible here. Instead the
write path is driven directly, using the identical multi-row `INSERT` that
`TelemetryBatchWriter` emits.

```bash
ROWS=20000 node loadtest/write-path-compare.mjs
```

Rows/second, three consecutive runs:

| Target | Batch | Run 1 | Run 2 | Run 3 |
| --- | ---: | ---: | ---: | ---: |
| via PgBouncer | 1,000 | 21,938 | 28,939 | 29,758 |
| direct to PG | 1,000 | 16,914 | 25,117 | 31,554 |
| via PgBouncer | 1,000 × 4 writers | 45,378 | 60,076 | 87,203 |
| direct to PG | 1,000 × 4 writers | **67,242** | **98,584** | **74,136** |

**Findings**

- A single batched writer sustains roughly **20–30k rows/s**.
- Four parallel writers reach roughly **60–100k rows/s**.
- **PgBouncer shows no consistent penalty.** Run 3 was faster through PgBouncer
  than direct. The ±40% run-to-run variance swamps any difference, so the
  earlier suspicion that PgBouncer throttles bulk inserts is **not supported**.
- Larger batches stop helping past ~1,000 rows. One run timed out entirely at
  batch 5,000 against the app pool's 15 s `query_timeout`, so bigger is not
  safer. **1,000 rows is a good ceiling for a single statement** — also
  comfortably inside Postgres's 65,535 bind-parameter limit (9 params/row caps a
  statement at 7,281 rows regardless).

**Conclusion.** The README claimed a single node sustains "roughly 50,000
rows/s". Measured, it does somewhat better — 60–100k with parallel writers — so
that figure was conservative rather than wrong. **The architectural conclusion is
unchanged and now has evidence behind it:** 133k rows/s is beyond a single
TimescaleDB node on hardware like this, so at full scale the in-process buffer
must be replaced by a durable stream (Kafka / NATS JetStream / Redis Streams),
or the hypertable must be sharded across nodes. `TelemetryBatchWriter` is
isolated behind one interface precisely so that swap does not touch the gateway.

---

## Test 3 — HTTP path

```bash
node loadtest/http-bench.mjs --concurrency 50 --requests 1000
```

| Endpoint | Throughput | p50 | p95 | p99 | Errors |
| --- | ---: | ---: | ---: | ---: | ---: |
| `POST /v1/realtime/ticket` | 2,959 req/s | 14 ms | 45 ms | 54 ms | 0 |
| `GET /v1/rate-cards` | 2,172 req/s | 17 ms | 54 ms | 93 ms | 0 |
| `POST /v1/trips/quote` | 2,022 req/s | 20 ms | 45 ms | 65 ms | 0 |
| `GET /v1/me` | **915 req/s** | 50 ms | 92 ms | 114 ms | 0 |

No errors at any point; the database pool never had a waiting client.

**`GET /v1/me` is the outlier at less than half the throughput of everything
else.** It is also the call every client makes on startup. It runs two
uncached queries (the user row, then the role rows) where the other endpoints
either hit the Redis cache or are pure computation. Folding it into one query,
or caching it briefly like the rate cards, is the cheapest available win.

---

## Bugs this found

1. **`mydriver_ws_connections` reported 0 while 1,000 sockets were open.** The
   gauge counted hub *room memberships*, so a connected-but-unsubscribed socket
   was invisible — an operator would have seen zero during an incident. Fixed:
   the gateway now counts real open sockets, and `mydriver_ws_subscribed` was
   added for the room count.
2. **No process memory metric existed.** Sampling RSS externally with `lsof`
   fails under load, because `lsof -iTCP:4000` enumerates every connected
   socket. Added `mydriver_process_rss_bytes` and
   `mydriver_process_heap_used_bytes`.
3. **Graceful shutdown does not finish inside 5 seconds with ~16k open
   sockets** — the dev watcher force-killed the process. In production a
   container's termination grace period (commonly 30 s) must be long enough to
   drain, or `app.close()` needs to close sockets more aggressively. **Not yet
   fixed** — it needs a decision about acceptable drain time.

---

## What still has not been measured

- **CPU per socket under real telemetry.** The binding constraint for instance
  count, and the biggest remaining gap.
- **The server's true socket ceiling** — blocked by the client-side port limit
  described above.
- **Sustained soak.** The longest hold here was 20 seconds; memory leaks and fd
  leaks need hours.
- **Redis under load.** Never approached saturation at this scale, so the
  Cluster path is untested in anger.
- **Multi-instance fan-out.** Everything ran against one backend process, so
  cross-instance Redis pub/sub delivery was never exercised under load.
