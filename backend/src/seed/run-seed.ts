/**
 * Production entry point, run before the API starts (see `start:migrate`).
 * Does nothing unless SEED_DEMO_ON_START=true. When enabled, the public demo
 * account is reset on every boot, so visitors always find clean, current data.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { seedDemo } from './demo-seed.js';

if (process.env.SEED_DEMO_ON_START === 'true') {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  });
  try {
    console.log(await seedDemo(prisma));
  } catch (error) {
    // A failed demo reset must not keep the API down.
    console.error('Demo seed failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}
