# FinTrack

Personal finance tracker — register income and expenses, organize them by category, set monthly budgets and explore reports.

> 🚧 Work in progress. The backend is complete; the React frontend is next.

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
