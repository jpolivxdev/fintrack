import { defineConfig } from 'vitest/config';

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5432/fintrack_test';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
    globalSetup: ['test/e2e/global-setup.ts'],
    // All suites share one database, so they run one file at a time.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: TEST_DATABASE_URL,
      JWT_ACCESS_SECRET: 'e2e-access-secret-0123456789abcdef0123456789',
      JWT_REFRESH_SECRET: 'e2e-refresh-secret-0123456789abcdef0123456789',
      BCRYPT_SALT_ROUNDS: '12',
      // Production limits. Each test request comes from its own fake client IP
      // (see test-app.ts), so only tests that pin an IP hit the limit.
      THROTTLE_AUTH_LIMIT: '5',
      THROTTLE_AUTH_TTL_MINUTES: '15',
      TRUST_PROXY_HOPS: '1',
      CORS_ORIGINS: 'http://localhost:5173',
    },
  },
});
