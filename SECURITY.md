# Security

How FinTrack's API is protected, why each decision was made, and how it is tested.
Every claim below has an automated test: most live in [`backend/test/security.e2e-spec.ts`](backend/test/security.e2e-spec.ts) and run in CI on every push.

## Reporting a vulnerability

Please open a [private security advisory](https://github.com/jpolivxdev/fintrack/security/advisories/new) instead of a public issue.

## OWASP API Security Top 10 (2023) mapping

| Risk | Mitigation in FinTrack | Test |
| --- | --- | --- |
| **API1 Broken Object Level Authorization** | Every query by id filters by the user's `householdId`, **including the `update`/`delete` itself** (`where: { id, householdId }`), not only a prior ownership check. The household is read from the database on every request (not from the token), so leaving or being removed takes effect immediately. Foreign ids are reported exactly like missing ids, and private events are also filtered by author. | 3 resources × GET/PATCH/DELETE matrix: 404 with a body identical to a nonexistent id; owner data unchanged; cannot reference another user's category in writes, filters or reports |
| **API2 Broken Authentication** | bcrypt cost 12; 15-min access JWT + 7-day refresh JWT with **rotation and reuse detection** (reuse ⇒ all sessions revoked); only the SHA-256 of refresh tokens is stored; real logout; HS256 pinned; tokens of deleted users rejected immediately; constant-time-ish login (dummy hash with the same cost) and a generic error for unknown email vs wrong password | Expired, forged, tampered, `alg: none`, HS512 and deleted-user tokens ⇒ 401; refresh used as access ⇒ 401; reuse ⇒ every session dies |
| **API3 Broken Object Property Level Authorization** | Global `ValidationPipe` with `whitelist` + `forbidNonWhitelisted` + `transform`; explicit response DTOs (no `passwordHash` ever serialized) | `userId`, `role`, `id`, `__proto__` in bodies ⇒ 400 and no effect |
| **API4 Unrestricted Resource Consumption** | Per-IP rate limits: **5 login/register attempts per 15 min**, 300 req/min elsewhere; 32 KB JSON body limit; max page size 100; string length caps (incl. password ≤ 128 to bound bcrypt work) | 6th attempt ⇒ 429 while other IPs still work; 413 on large bodies; k6 abuse scenario ([LOAD_TESTING.md](backend/LOAD_TESTING.md)) |
| **API5 Broken Function Level Authorization** | Global JWT guard; routes are private unless explicitly marked `@Public()` (only auth, health, docs) | Protected routes without/with malformed token ⇒ 401 |
| **API8 Security Misconfiguration** | Explicit Helmet policy, CORS allowlist, env validated at boot, generic 500s (see below) | Header, CORS and 500 tests |
| **API10 Unsafe Consumption / Injection** | Prisma parameterized queries; the 2 raw queries use tagged templates (bound parameters, never string concatenation); strict formats (`@IsUUID`, `@IsDateOnly`, `@IsEnum`, `@IsIn` for sort fields) | SQL injection payloads stored as plain text; schema intact; injection in `sortBy`/enum/id ⇒ 400 |

## Decisions worth explaining

**404 instead of 403 for other users' resources.** A 403 confirms that the id exists. Returning the same 404 (same body) for "doesn't exist" and "isn't yours" makes ids non-enumerable.

**Stored XSS: validate and store verbatim, escape on output.** Free text (`description`, `notes`) is stored exactly as typed. Escaping is the presentation layer's job: React escapes by default, and the API only ever serves `application/json` with `X-Content-Type-Options: nosniff` and `CSP: default-src 'none'`, so a browser never renders a response as HTML. Server-side "sanitizing" (e.g. `class-sanitizer`, which is unmaintained) was rejected: it corrupts legitimate data (`Tom & Jerry` → `Tom &amp; Jerry`), causes double-escaping and gives a false sense of safety. What *is* rejected at input: control characters. Postgres refuses NUL bytes, and before this fix they produced **500 errors** on create and on search.

**Refresh token in the response body, not an httpOnly cookie.** API (Render) and frontend (Vercel) live on different sites, where third-party cookies are increasingly blocked. The trade-off: the frontend must keep the refresh token in memory/storage, so XSS hygiene on the frontend matters. That is mitigated by short access-token life, rotation with reuse detection, and logout revocation.

**Sharing a household.** Invite codes are 8 characters from a 31-symbol alphabet (~40 bits), generated with `crypto.randomInt`. They are valid for 48 h, single-use (claimed with a conditional update, so two concurrent joins cannot both win) and stored only as SHA-256. Joining is rate-limited like login, and "wrong", "used" and "expired" share one error, so codes cannot be probed. Joining merges the newcomer's data into the household inside one transaction. The shared demo account cannot create or accept invites.

**Calendar sharing is not household sharing.** People who share calendars stay in separate households: the event query adds only events with `visibility = SHARED` whose creator is a partner, so a partner never sees private events, the other household's events, bills or any money. Either side can stop sharing, and access ends on the next request (pairs are read from the database every time). Codes follow the same rules as household invites.

**Leaving a household gives your data back.** Accounts and categories record who brought them (`ownerId`, backfilled for single-member households). Leaving or being removed moves your accounts with everything on them, plus the goals and events you created; categories the other side still uses are copied by name instead of moved, and a transfer between the two sides becomes an expense on one side and an income on the other, so neither household keeps a pointer to the other's account. It all runs in one transaction. This was found in real use: before the fix, leaving left your data behind.

**Forgot password.** `POST /auth/forgot-password` always answers the same (202) and sends the e-mail in the background, so neither the body nor the response time reveals whether an account exists. The link carries 32 random bytes (base64url) in the URL **fragment** (`#token=`), which browsers never send to servers, proxies or `Referer` headers; only its SHA-256 is stored, it expires in 30 minutes, is claimed atomically (single use), and a new request invalidates older links. Resetting revokes every refresh token. Links are built from `APP_URL`, never from request headers (no host-header poisoning). Both endpoints share the login rate limit; the demo account never receives links. E-mail goes through Brevo's HTTPS API; without it the server reports `passwordReset: false` and the app hides the option instead of promising an e-mail that never arrives.

**Market data from Banco Central.** The API fetches CDI (SGS 12) and IPCA (SGS 433) from a fixed URL whose only variables are validated dates, with an 8 s timeout, at most every 6 h (10 min after a failure), one request at a time per series. Every value is range-checked before it is stored. If BCB is down, the last cached rates are used and the response says so (`missingMarketData`) instead of inventing numbers. Tests use a deterministic provider, so CI never calls BCB.

**CSV export and import.** Exported text cells starting with `= + - @` (or tab/CR) are prefixed with `'`, so a description like `=HYPERLINK(...)` is never executed by Excel or Sheets. Statements are parsed in the browser and only normalized rows are sent: at most 500 rows, with a 512 KB body limit on that route only (32 KB everywhere else). Re-importing is idempotent because OFX `FITID`s are unique per account.

**The PWA never stores financial data.** The service worker precaches only the app shell. `/api` is excluded from the navigation fallback and has no runtime caching, so balances are never served stale or left on the device.

**Dates are `YYYY-MM-DD` only.** `2026-10-01T23:00-03:00` is already Oct 2 in UTC; accepting timestamps would silently file transactions under the wrong day. Calendar events are the exception: they are real instants, so they require a full ISO timestamp **with an offset** (a bare `2026-10-02T22:00` is rejected rather than guessed).

**Trusting the proxy, exactly.** The rate limiter keys on the client IP. Behind Render the app sees the proxy's IP, and Render *appends* to `X-Forwarded-For` without stripping client-supplied values, so `trust proxy: true` would let anyone spoof their IP and bypass the limit. The app trusts exactly `TRUST_PROXY_HOPS` hops (3 on Render, per [Render's community guidance](https://community.render.com/t/what-number-of-proxies-sit-in-front-of-an-express-app-deployed-on-render/35981)).
*Verified in production:* 7 login attempts, each with a different forged `X-Forwarded-For`, all landed in the same bucket and got 429, so spoofing does not bypass the limit. *Limitation:* from a single client I cannot prove the hop count isn't *lower* than reality (that would make users share a proxy IP's bucket); this relies on Render's documented chain.

## Configuration hardening

- **Secrets** only via environment. Boot fails if `JWT_*_SECRET` is shorter than 32 chars, if both secrets are equal, or if a `change-me` placeholder reaches production. Render generates 256-bit values. Only `.env.example` (fake values) is versioned; git history audited for leaks.
- **Helmet, explicitly configured:** API responses get `CSP: default-src 'none'; frame-ancestors 'none'`, HSTS (1 year, subdomains), `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: no-referrer`, no `X-Powered-By`. Swagger UI gets its own, slightly wider CSP (only its own assets).
- **CORS:** explicit origin allowlist (a `*` is refused at boot), methods limited to GET/POST/PATCH/DELETE, headers to `Authorization`/`Content-Type`/`X-Request-Id`, no credentials (no cookies are used).
- **Errors:** one global filter. 4xx keep their useful message; anything unexpected becomes `{ statusCode: 500, message: "Internal server error", requestId }`. The stack trace goes to the server log only, and the `requestId` (also in the `X-Request-Id` header) links the user's report to the log line.

## Security logging

Structured JSON logs in production (searchable on Render). Logged: failed logins (email masked as `ma***@example.com`, IP, requestId), 401/403/429 (method, path, IP, userId, requestId), and refresh-token reuse (error level: likely theft). **Never logged:** bodies, passwords, tokens, `Authorization` headers.

Repeated events from one IP are **aggregated per 60 s window**: the first is logged, the rest become a single `*_aggregated` line with a `suppressed` count. Memory is capped at 10k tracked IPs. Under a 260k-request flood this took the log from ~216k lines to 56, and made the API faster.

## Supply chain and CI

- `npm audit`: 9 findings → **0**. Removed an unused scaffold dependency (`@nestjs/mau`); `overrides` pin patched `mysql2`/`deepmerge-ts` pulled in by the Prisma CLI (MySQL-only code paths, not exploitable here, but fixed anyway and validated with Prisma generate/migrate/seed + full test suite).
- **CI** ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)): `npm audit --audit-level=high` (fails the build), lint, type check, unit tests with coverage, e2e tests against PostgreSQL, build, Docker image build.
- **CodeQL** (`security-extended`) on every push and weekly; **Dependabot** for npm, the Docker base image and GitHub Actions.

## Known limitations / next steps

- Rate-limit counters live in memory: fine for one instance, but scaling horizontally needs a shared store (Redis), or the limits multiply by the number of instances.
- Login throttling is per IP. Credential stuffing from a botnet (many IPs) needs per-account lockout or CAPTCHA after N failures, and breached-password checks (HIBP) at registration.
- Volumetric DoS protection belongs at the edge (Cloudflare/WAF); app-level 429s still cost CPU (see LOAD_TESTING.md, scenario 4).
- No email verification or password reset yet (and hence no account-recovery attack surface).
