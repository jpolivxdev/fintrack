import { execSync } from 'node:child_process';

/** Brings the test database schema up to date once before all e2e suites. */
export default function setup() {
  const databaseUrl =
    process.env.TEST_DATABASE_URL ??
    'postgresql://postgres:postgres@localhost:5432/fintrack_test';

  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'inherit',
  });
}
