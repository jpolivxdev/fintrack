# Load & stress testing

Load tests use **[k6](https://k6.io)**. Scripts live in [`load-tests/`](load-tests).

## How the tests were run

| | |
| --- | --- |
| Where | **Locally**, not against production. The Render/Neon free tiers are small shared quotas: hammering them would measure the free plan (and abuse its fair-use terms), not the code. |
| Machine | AMD Ryzen 7 5800X (8C/16T), 16 GB RAM, Windows 10. k6, API and PostgreSQL 18 on the same host, so absolute numbers are optimistic about network latency and pessimistic about CPU contention. **Compare runs with each other, not with other machines.** |
| API | `NODE_ENV=production`, single Node 24 process, Prisma pool default (10). |
| Data | `npm run load:seed`: 50 users × 300 transactions + 1 "heavy" user with **100,000 transactions** over 5 years (115k rows in the table). |
| Client IPs | Every virtual user sends its own `X-Forwarded-For` (API runs with `TRUST_PROXY_HOPS=1`), like real clients behind Render's proxy. Without this, the per-IP rate limit would (correctly) block the whole test, since k6 runs from one IP. |

```bash
npm run db:dev                 # terminal 1
npm run load:seed              # once
npm run build && NODE_ENV=production TRUST_PROXY_HOPS=1 node dist/main.js   # terminal 2
k6 run load-tests/1-normal-load.js
k6 run -e PEAK=300 load-tests/2-spike.js
k6 run load-tests/3-reports-stress.js
k6 run load-tests/4-rate-limit-abuse.js
```

Raw k6 JSON summaries are written to `load-tests/results/` (gitignored).

---

## Scenario 1 — Normal load

50 VUs ramping up over 30 s, 60 s steady, 15 s ramp-down. Each VU logs in once, then loops: list transactions → create a transaction → read the dashboard summary, with 1 s think time between actions.

| Endpoint | avg | p95 | p99 |
| --- | ---: | ---: | ---: |
| `POST /auth/login` | 211.8 ms | 222.5 ms | 239.9 ms |
| `GET /transactions` | 5.7 ms | 7.2 ms | 18.2 ms |
| `POST /transactions` | 8.7 ms | 12.0 ms | 219.6 ms |
| `GET /reports/summary` | 2.9 ms | 5.1 ms | 34.1 ms |
| **All** | **8.3 ms** | **12.1 ms** | 211.7 ms |

**4,255 requests · 39.7 req/s · 0.00 % errors.** All thresholds passed.

- Login is ~210 ms **by design**: bcrypt with cost 12 is what makes offline brute force of a leaked hash expensive. The overall p99 is just the logins.
- Found during this run: the first version of the script built amounts with float math (`124.45000000000002`) and **the API rejected them with 400** (max 2 decimals). That was the money validation working under load; the script now uses integer cents.

## Scenario 2 — Spike on the most-read endpoint

`GET /transactions` only. 10 s at 20 VUs, then a jump to the peak in 5 s, held for 30 s. Each VU does ~2 req/s (a busy human, below the per-IP limit).

| Peak VUs | Throughput | avg | p95 | p99 | Errors |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 300 | 342.8 req/s | 7.8 ms | 22.6 ms | 36.4 ms | 0 % |
| 500 | 435.4 req/s | 161.7 ms | 290.9 ms | 326.4 ms | 0 % |
| 1,000 | 446.0 req/s | 783.7 ms | 1,040 ms | 1,086 ms | 0 % |

**Saturation point: ~440 req/s.** Past it, throughput plateaus and latency grows (requests queue), but **not a single request failed, even at 1,000 VUs**: the API degrades smoothly instead of crashing.

**Where the bottleneck is** (CPU sampled during an 800-VU spike):

| Process | CPU |
| --- | ---: |
| `node` (API) | ~126 % of one core (event loop saturated + GC/libuv threads) |
| `postgres` (all backends) | ~82 % of one core, out of 16 available |

The database is far from its limit. The ceiling is **the single Node.js process**: JSON serialization, validation, JWT HMAC verification and Prisma's in-process query building all run on one thread.

**How to scale beyond this:** run several instances (`node:cluster`, PM2 or more Render instances). One prerequisite is a **shared rate-limit store (Redis)**. The throttler currently keeps counters in memory, so N instances would each allow 5 login attempts, which turns the brute-force limit into 5×N. Not implemented here on purpose, to avoid silently weakening that protection.

## Scenario 3 — Report aggregations under stress (before / after)

20 constant VUs, no think time, cycling through the 4 report endpoints for the heavy user (100k transactions), 45 s.

### Diagnosis

`EXPLAIN ANALYZE` on the hot queries ([`load-tests/explain.ts`](load-tests/explain.ts)), after `VACUUM ANALYZE`:

| Query | Before: plan | Before | After: plan | After |
| --- | --- | ---: | --- | ---: |
| monthly evolution (12 months) | Bitmap Heap Scan on `(userId, date)` | 20.4 ms | **Index Only Scan** on covering index | 17.7 ms |
| totals by category (9 months) | Bitmap Heap Scan on `(userId, date)` | 6.4 ms | **Index Only Scan** on covering index | 3.4 ms |
| balance (all history) | Seq Scan | 24.0 ms | Seq Scan | 24.8 ms |
| list page 1 | Index Scan Backward `(userId, date)` | 0.08 ms | Index Scan Backward (covering) | 0.13 ms |

- The suggested `(userId, date)` index **already existed** since the first schema version, and the queries used it. The remaining cost was **visiting table rows** to read `type`, `categoryId` and `amount`.
- **Fix:** replace it with a covering index `(userId, date, type, categoryId, amount)` (migration `covering_index_for_reports`). Every aggregate and the date-ordered listing are then served from the index alone.
- The all-time balance stays a Seq Scan, and that is **the planner being right**: the heavy user owns 87 % of the table, so reading it sequentially is cheaper. With realistic data (thousands of rows per user in a large table), the index is chosen.

### Results

| Endpoint | p95 before | p95 after | avg before | avg after |
| --- | ---: | ---: | ---: | ---: |
| `/reports/summary` | 102.7 ms | 93.2 ms | 70.2 ms | 62.6 ms |
| `/reports/monthly` | 108.0 ms | 98.5 ms | 81.9 ms | 72.4 ms |
| `/reports/by-category` | 104.1 ms | 87.9 ms | 64.5 ms | 50.9 ms |
| `/reports/budget-vs-actual` | 110.7 ms | 96.7 ms | 53.0 ms | 45.3 ms |
| **All** | **106.5 ms** | **94.7 ms** | **67.4 ms** | **57.8 ms** |
| **Throughput** | **294.3 req/s** | **343.5 req/s (+17 %)** | | |

0 % errors in both runs.

### An optimization that was reverted

Hypothesis: `/reports/summary` runs 4 queries (this month, last month, all-time balance, count). Merging them into **one pass with `SUM(...) FILTER (WHERE ...)`** should be faster.

Measured: **it was slower.** p95 of `/summary` went from 103 ms to **174–335 ms**. The single query became a Parallel Seq Scan evaluating 6 conditional aggregates per row (28 ms in isolation), and under concurrency its parallel workers compete for CPU. The original version runs its 4 queries **concurrently on the pool**, and 3 of them are cheap 1-month index range scans. **Reverted**: measure, don't assume.

## Scenario 4 — Abuse: rate limiting under attack

For 45 s, concurrently:
- **flood**: 50 VUs from **one IP**, no think time, on `GET /transactions`;
- **brute force**: 20 login attempts/s from the same IP;
- **legit**: 20 normal users (own IPs, ~2 req/s each).

| Metric | Result |
| --- | --- |
| Total load | **217,646 requests · 4,363 req/s** |
| Attacker: requests served | **300**, exactly the global limit (300/min per IP) |
| Attacker: answered `429` | **214,907**, avg 10.4 ms (p95 14.0 ms) |
| Brute force (901 attempts) | **5** reached the password check (401), **896** got `429`. 0 successful guesses. |
| Legit users | **0 % errors**, p95 109 ms |
| API process | stayed up; `/health` OK during and after |

Findings:
1. **Rate limiting degrades gracefully.** The attacker gets cheap, fast 429s and the process never falls over.
2. **App-level 429s still cost CPU.** At 4,300 req/s of rejected traffic, legit p95 rose from ~10 ms to ~109 ms because the event loop is busy rejecting. In a production setup, volumetric limits belong **at the edge** (Cloudflare/WAF/API gateway), before traffic reaches Node; the app keeps the fine-grained rules (login attempts per IP).
3. **Log flooding.** The run wrote **~216k log lines in 45 s** (one per 429). An attacker could use that to fill disks, burn log quota or bury other events. Fixed: rate-limit logs are aggregated per IP and window (see SECURITY.md).
4. A first run showed 30 % errors for "legit" users. The cause was that run itself: the users had no think time (~9 req/s each) and were **rightly** throttled, and the in-memory counters carried the block into the next run. A clean run with realistic think time had 0 % errors.
