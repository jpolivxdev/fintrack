# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Frontend (to be built): React + Vite + TypeScript, TailwindCSS, React Router, TanStack Query + Axios, react-hook-form + zod, Recharts, @react-three/fiber + drei (3D), Framer Motion; components adapted from 21st.dev where useful. Deploy on Vercel.
Backend (done, live): NestJS 12 REST API, Prisma 7, PostgreSQL (Neon), JWT, deployed on Render. Docs: https://fintrack-api-qgr2.onrender.com/api/docs

## Users

Primary: an individual managing their own personal finances, using the app day to day to record income and expenses, keep spending within monthly limits and understand where the money goes.

Secondary (confirmed context, not the design target): recruiters and technical evaluators who open the project from a portfolio, usually through the public demo account.

## Product Purpose

FinTrack lets a person record income and expenses, organize them into categories, set monthly budgets per category and see reports on their finances. Success means the user records transactions with little effort and quickly understands their month: how much came in and went out, whether they are within budget, and how this month compares with the previous one.

## Positioning

Insights, not just bookkeeping: the product computes and surfaces budget vs. actual (with on-track / warning / exceeded status), month-over-month change, savings rate, running balance and category breakdowns, instead of only listing transactions.

Beyond that, the product makes its engineering rigor visible (security, tests, performance are part of what it demonstrates) and aims for a memorable experience (3D touch and micro-interactions) rather than a generic CRUD look.

## Operating Context

- Personal use in Brazil: Portuguese (pt-BR) interface, Brazilian real (R$ 1.234,56), dates as dd/mm/aaaa.
- Typical loop: log in → glance at the month's summary → add a transaction → check budgets and reports.
- Evaluators enter through the public demo account (`demo@fintrack.dev` / `Demo@1234`), whose data is reset on every API start with ~7 months of history relative to today.
- The API on Render's free tier sleeps when idle: the first request can take ~50 s, so the app must handle a slow first response gracefully.

## Capabilities and Constraints

- Auth: register, login, logout; 15-min access token + rotating refresh token returned in the response body (not a cookie); the client must refresh automatically and only once at a time (reusing a refresh token revokes all sessions).
- Categories (INCOME / EXPENSE, optional color and lucide icon name); new accounts start with 10 default Portuguese categories. Categories with transactions cannot be deleted.
- Transactions: CRUD with filters (type, category, period, text search), sorting, pagination (max 100 per page) and totals for the filtered set. A transaction's type must match its category's type.
- Budgets: monthly limit per expense category, progress (spent, remaining, percent used) and status ON_TRACK (< 80 %), WARNING (80–100 %), EXCEEDED (> 100 %); copy last month's budgets.
- Reports: monthly summary with previous-month comparison and savings rate; monthly evolution with running balance; totals by category; budget vs. actual plus unbudgeted spending.
- Money arrives as decimal strings with 2 places (`"1234.50"`); never do money math in floating point. Dates are `YYYY-MM-DD`.
- Rate limits: 5 login/register attempts per IP per 15 min (HTTP 429 with a retry header).
- Free text is stored verbatim; the UI must render it as text, never as HTML.
- Undecided: account/wallet separation (out of v1), multi-currency (not planned), dark mode (planned as a plus).

## Brand Commitments

Name: FinTrack. Interface language: Portuguese (pt-BR).

## Evidence on Hand

- Public demo account with ~7 months of realistic data (backend `src/seed/demo-seed.ts`).
- Live Swagger docs (URL above).
- Measured engineering evidence: `SECURITY.md` (OWASP API Top 10 mapping, 49 security tests), `backend/LOAD_TESTING.md` (k6 results), CI with tests and CodeQL.
- Absent: real users, testimonials, usage numbers, press. Future work must not fabricate them.

## Product Principles

1. Fast daily capture: adding a transaction should take seconds, from anywhere in the app.
2. Insight first: lead with what the numbers mean (status, comparison, trend), not raw tables.
3. Trust through correctness: exact money, clear errors, no surprising states; the user's data is always theirs alone.
4. Rigor you can see: the quality of the engineering is part of the experience, not hidden in the repo.
5. Memorable, never in the way: delight (3D, motion) is a layer on top of a fully working product and must not slow down the core tasks.
