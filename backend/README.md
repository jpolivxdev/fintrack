# FinTrack API

REST API for FinTrack, built with **NestJS 12**, **Prisma 7** and **PostgreSQL**.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run db:dev` | Starts a local PostgreSQL (embedded, no Docker) with `fintrack` and `fintrack_test` databases |
| `npm run start:dev` | API in watch mode on `http://localhost:3000` |
| `npm run prisma:migrate` | Creates/applies migrations in development |
| `npm run prisma:seed` | Seeds the demo account (`demo@fintrack.dev` / `Demo@1234`) |
| `npm test` | Unit tests (services, calculations) |
| `npm run test:cov` | Unit tests with coverage report (`coverage/`) |
| `npm run test:e2e` | End-to-end tests against the `fintrack_test` database |
| `npm run lint` | Lint with oxlint |

## Project layout

```
src/
├── auth/          register, login, refresh rotation, logout, JWT strategy, global guard
├── categories/    CRUD + default categories for new users
├── transactions/  CRUD with filters, pagination, sorting and totals
├── budgets/       monthly limits per category with progress/status
├── reports/       summary, monthly evolution, by category, budget vs actual
├── common/        decorators, pagination, money/date helpers, Prisma error filter
├── config/        environment validation (the app refuses to boot with bad env)
└── prisma/        PrismaService (driver adapter for pg)
```

Full documentation coming with the final README.
