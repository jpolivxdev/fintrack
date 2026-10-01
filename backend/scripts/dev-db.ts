/**
 * Local PostgreSQL without Docker.
 *
 * Boots a real PostgreSQL server from the `embedded-postgres` npm package and
 * creates the `fintrack` (dev) and `fintrack_test` (e2e) databases.
 * Keep it running in a separate terminal: `npm run db:dev`.
 *
 * If you have Docker, `docker compose up -d db` does the same job.
 */
import EmbeddedPostgres from 'embedded-postgres';
import { existsSync } from 'node:fs';

const DATA_DIR = './.pgdata';
const DATABASES = ['fintrack', 'fintrack_test'];

const pg = new EmbeddedPostgres({
  databaseDir: DATA_DIR,
  user: 'postgres',
  password: 'postgres',
  port: 5432,
  persistent: true,
  onLog: () => {},
});

if (!existsSync(DATA_DIR)) {
  await pg.initialise();
}
await pg.start();

const client = pg.getPgClient();
await client.connect();
for (const name of DATABASES) {
  const { rowCount } = await client.query(
    'SELECT 1 FROM pg_database WHERE datname = $1',
    [name],
  );
  if (!rowCount) {
    await client.query(`CREATE DATABASE ${name}`);
    console.log(`Created database "${name}"`);
  }
}
await client.end();

console.log('PostgreSQL running on postgres://postgres:postgres@localhost:5432');
console.log('Press Ctrl+C to stop.');

const shutdown = async () => {
  await pg.stop();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
