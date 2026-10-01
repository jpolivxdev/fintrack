import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { Server } from 'node:http';
import { AppModule } from '../../src/app.module.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { setupApp } from '../../src/setup-app.js';

export interface TestContext {
  app: INestApplication<Server>;
  prisma: PrismaService;
  http: () => ReturnType<typeof request>;
}

/** Boots the real application (same global setup as production). */
export async function createTestApp(): Promise<TestContext> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<INestApplication<Server>>();
  setupApp(app);
  await app.init();

  const prisma = app.get(PrismaService);
  return { app, prisma, http: () => request(app.getHttpServer()) };
}

/** Wipes every table between suites. */
export async function resetDatabase(prisma: PrismaService): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "transactions", "budgets", "categories", "refresh_tokens", "users" CASCADE',
  );
}

let counter = 0;

/** Registers a fresh user and returns its tokens. */
export async function registerUser(ctx: TestContext, name = 'User') {
  counter += 1;
  const email = `${name.toLowerCase()}-${Date.now()}-${counter}@test.dev`;
  const res = await ctx
    .http()
    .post('/api/auth/register')
    .send({ name, email, password: 'Passw0rd!' })
    .expect(201);
  return {
    email,
    password: 'Passw0rd!',
    accessToken: res.body.accessToken as string,
    refreshToken: res.body.refreshToken as string,
    user: res.body.user as { id: string; email: string },
    auth: { Authorization: `Bearer ${res.body.accessToken}` },
  };
}
