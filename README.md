# FinTrack

[![CI](https://github.com/jpolivxdev/fintrack/actions/workflows/ci.yml/badge.svg)](https://github.com/jpolivxdev/fintrack/actions/workflows/ci.yml) [![CodeQL](https://github.com/jpolivxdev/fintrack/actions/workflows/codeql.yml/badge.svg)](https://github.com/jpolivxdev/fintrack/actions/workflows/codeql.yml)

Personal finance tracker — register income and expenses, organize them by category, set monthly budgets and explore reports.

> 🚧 Work in progress. The backend is live; the React frontend is next.

**Live API docs (Swagger):** https://fintrack-api-qgr2.onrender.com/api/docs  
**Demo account:** `demo@fintrack.dev` / `Demo@1234`  
<sub>Hosted on Render free tier — the first request after idle can take ~50s to wake up.</sub>

| Part | Stack | Folder |
| --- | --- | --- |
| REST API | NestJS 12 · TypeScript · Prisma 7 · PostgreSQL · JWT · Swagger · Vitest | [`backend/`](backend) |
| Web app | React · Vite · Tailwind · TanStack Query · Recharts · R3F | `frontend/` (coming soon) |

## Quick start (API)

```bash
cd backend
cp .env.example .env
npm install
npm run db:dev          # terminal 1: local PostgreSQL (no Docker needed)
npm run prisma:deploy   # terminal 2: apply migrations
npm run prisma:seed     # demo data — demo@fintrack.dev / Demo@1234
npm run start:dev       # http://localhost:3000/api/docs
```

With Docker instead: `docker compose up -d db` replaces `npm run db:dev`.

See [`backend/README.md`](backend/README.md) for details.

## Security

Security went beyond CRUD: each point below has automated tests ([`security.e2e-spec.ts`](backend/test/security.e2e-spec.ts), 40+ cases) running in CI. Full write-up with the reasoning behind each decision: **[SECURITY.md](SECURITY.md)**.

- **BOLA/IDOR prevention**: every read *and write* is scoped by the token's user. Other users' ids get the same 404 as nonexistent ones, so ids can't be enumerated (tested across every resource × verb).
- **Authentication**: bcrypt (cost 12), 15-min access tokens, refresh token **rotation with reuse detection** (only hashes stored), real logout, pinned HS256, deleted users' tokens rejected immediately.
- **Rate limiting**: 5 login/register attempts per IP per 15 min plus a global per-IP limit, keyed on the real client IP behind the proxy (spoofing `X-Forwarded-For` verified not to bypass it in production).
- **Input validation**: whitelist validation rejects unknown fields (mass assignment), with strict formats for ids, dates and enums. Found and fixed a NUL-byte input that caused 500s.
- **Injection & XSS**: parameterized queries only (SQL-injection payloads stored as inert text). Free text is stored verbatim and escaped at render time; the API serves only JSON with `nosniff` and `CSP: default-src 'none'`.
- **Hardening**: explicit Helmet/CSP/HSTS, CORS allowlist, env validated at boot (weak or placeholder secrets refused), generic 500s with a `requestId` (stack traces only in server logs).
- **Observability**: structured JSON security logs (failed logins with masked email, 401/403/429, refresh-token reuse) with **per-IP aggregation**, which cut a 260k-request attack from ~216k log lines to 56.
- **Supply chain**: `npm audit` 9 → 0, Dependabot, CodeQL, and CI failing on high/critical vulnerabilities.

## Performance

Load-tested with k6 (normal load, spikes up to 1,000 VUs, report stress on 100k rows, rate-limit abuse). Highlights: 0 errors at every load level, saturation around 440 req/s per Node process with the database far from its limit, and a covering index that raised report throughput by 17%. Details, numbers and one optimization that was measured and reverted: **[LOAD_TESTING.md](backend/LOAD_TESTING.md)**.
