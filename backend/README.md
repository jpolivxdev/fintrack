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
├── households/    shared household: invites, join (with data merge), leave, remove member
├── accounts/      accounts/cards with balances, transfers between them
├── categories/    CRUD + default categories for new users
├── transactions/  CRUD with filters and totals, installments, CSV export, statement import
├── recurring/     recurrence rules, materialized on demand by a global interceptor
├── budgets/       monthly limits per category with progress/status
├── goals/         savings goals, contributions, pace and projected completion
├── calendar/      events (shared or private) + the month's bills feed
├── insights/      monthly insights as structured data (phrased by the frontend)
├── reports/       summary, monthly evolution, by category, budget vs actual
├── seed/          demo household (two members, accounts, goals, events)
├── common/        decorators, pagination, money/date helpers, Prisma error filter
├── config/        environment validation (the app refuses to boot with bad env)
└── prisma/        PrismaService (driver adapter for pg)
```

All data belongs to a **household**: one per user, shared by two or more people for a couple. Money is stored as `Decimal`, and installments are split with integer-cent math so the parts always add up. See the root [README](../README.md) and [SECURITY.md](../SECURITY.md).
