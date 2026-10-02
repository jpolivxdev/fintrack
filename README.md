# FinTrack

[![CI](https://github.com/jpolivxdev/fintrack/actions/workflows/ci.yml/badge.svg)](https://github.com/jpolivxdev/fintrack/actions/workflows/ci.yml) [![CodeQL](https://github.com/jpolivxdev/fintrack/actions/workflows/codeql.yml/badge.svg)](https://github.com/jpolivxdev/fintrack/actions/workflows/codeql.yml)

Personal finance for one person or a couple: income and expenses across accounts and cards, installment purchases, monthly budgets, savings goals, investments compared with the CDI and inflation, recurring bills, automatic insights and a shared calendar. Built mobile-first (installable as a PWA), in pt-BR with amounts in R$.

## Features

- **Accounts and cards**: checking, credit card, cash and savings, each with its own balance, plus transfers between them (e.g. paying the card bill).
- **Installments**: buy in up to 24x. Each installment lands in its own month, and deleting asks "only this / this and future / all".
- **Recurring transactions**: salary, rent and subscriptions as rules (weekly, monthly, yearly) that generate entries when their date arrives.
- **Budgets and goals**: monthly limits per category with alerts at 80%, and savings goals with contributions, pace and projected completion.
- **Investments**: CDBs, Tesouro, stocks, crypto... Fixed income grows by itself with the official CDI and IPCA from Banco Central (% of CDI, pre-fixed, IPCA+); market-priced assets follow the values you read on the broker. See value, profit, "% of the CDI", allocation and a month-by-month chart against "100% of the CDI" and "contributions + inflation". Monthly contributions can be scheduled, and an expense you used to log as recurring can be moved to investments (past months included).
- **Insights**: the month in plain sentences ("Lazer above normal", "budget will be exceeded at this pace", "2 bills in the next 7 days").
- **Shared calendar**: connect your calendar with someone through a one-time code; events marked "shared" show up for both, private ones stay private, and finances stay separate.
- **Shared finances (optional)**: a household joins the finances of a couple, and each entry shows who registered it. Leaving takes your accounts, history, goals and events back with you.
- **Import and export**: bank statements in OFX or CSV, parsed in the browser with a preview; re-importing never duplicates. Export goes to Excel-friendly CSV.
- **Mobile-first**: bottom tab bar, bottom-sheet forms, iPhone safe areas, and an installable PWA that never caches financial data.

**Live API docs (Swagger):** https://fintrack-api-qgr2.onrender.com/api/docs  
**Demo account:** `demo@fintrack.dev` / `Demo@1234`  
<sub>Hosted on Render free tier — the first request after idle can take ~50s to wake up.</sub>

| Part | Stack | Folder |
| --- | --- | --- |
| REST API | NestJS 12 · TypeScript · Prisma 7 · PostgreSQL · JWT · Swagger · Vitest | [`backend/`](backend) |
| Web app | React 19 · Vite · Tailwind v4 · shadcn/ui · TanStack Query · Recharts · R3F · Motion · PWA | [`frontend/`](frontend) |

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

Web app (with the API running):

```bash
cd frontend
npm install
npm run dev             # http://localhost:5173 — "Explorar com a conta demo"
```

See [`backend/README.md`](backend/README.md) for details.

## Security

Security went beyond CRUD: each point below has automated tests ([`security.e2e-spec.ts`](backend/test/security.e2e-spec.ts), 40+ cases) running in CI. Full write-up with the reasoning behind each decision: **[SECURITY.md](SECURITY.md)**.

- **BOLA/IDOR prevention**: every read *and write* is scoped by the user's household. Membership is re-checked on every request, so a removed partner loses access immediately. Other households' ids get the same 404 as nonexistent ones, so ids can't be enumerated (tested across every resource × verb). Private calendar events stay private even inside the household.
- **Authentication**: bcrypt (cost 12), 15-min access tokens, refresh token **rotation with reuse detection** (only hashes stored), real logout, pinned HS256, deleted users' tokens rejected immediately.
- **Rate limiting**: 5 login/register attempts per IP per 15 min plus a global per-IP limit, keyed on the real client IP behind the proxy (spoofing `X-Forwarded-For` verified not to bypass it in production).
- **Input validation**: whitelist validation rejects unknown fields (mass assignment), with strict formats for ids, dates and enums. Found and fixed a NUL-byte input that caused 500s.
- **Injection & XSS**: parameterized queries only (SQL-injection payloads stored as inert text). Free text is stored verbatim and escaped at render time; the API serves only JSON with `nosniff` and `CSP: default-src 'none'`.
- **Safe sharing**: invite codes (household and calendar) are random, single-use (claimed atomically), expire in 48 h, are stored only as hashes and are rate-limited like logins. A wrong, used or expired code gets the same error. Calendar partners see only events marked shared, never finances.
- **External data, contained**: CDI/IPCA come from a fixed Banco Central URL (no user input in it), with a timeout, sanity bounds on every value and a database cache, so an outage only means slightly older rates.
- **Import/export**: CSV export neutralizes spreadsheet formula injection (`=HYPERLINK(...)`). Imports are capped (rows and body size) and deduplicated by the bank's transaction id.
- **Hardening**: explicit Helmet/CSP/HSTS, CORS allowlist, env validated at boot (weak or placeholder secrets refused), generic 500s with a `requestId` (stack traces only in server logs).
- **Observability**: structured JSON security logs (failed logins with masked email, 401/403/429, refresh-token reuse) with **per-IP aggregation**, which cut a 260k-request attack from ~216k log lines to 56.
- **Supply chain**: `npm audit` 9 → 0, Dependabot, CodeQL, and CI failing on high/critical vulnerabilities.

## Performance

Load-tested with k6 (normal load, spikes up to 1,000 VUs, report stress on 100k rows, rate-limit abuse). Highlights: 0 errors at every load level, saturation around 440 req/s per Node process with the database far from its limit, and a covering index that raised report throughput by 17%. Details, numbers and one optimization that was measured and reverted: **[LOAD_TESTING.md](backend/LOAD_TESTING.md)**.
