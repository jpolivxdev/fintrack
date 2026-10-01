import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { Server } from 'node:http';
import { AppModule } from '../../src/app.module.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { setupApp } from '../../src/setup-app.js';

type Agent = ReturnType<typeof request>;

export interface TestContext {
  app: INestApplication<Server>;
  prisma: PrismaService;
  /** Requests from a fresh client IP each time (override with .set('X-Forwarded-For', ip)). */
  http: () => Pick<Agent, 'get' | 'post' | 'patch' | 'delete'>;
}

let ipCounter = 0;

/** A unique fake client IP, as a reverse proxy would report it. */
export function nextClientIp(): string {
  ipCounter += 1;
  return `10.${(ipCounter >> 16) & 255}.${(ipCounter >> 8) & 255}.${ipCounter & 255}`;
}

/** Boots the real application (same global setup as production). */
export async function createTestApp(): Promise<TestContext> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<INestApplication<Server>>();
  setupApp(app);
  await app.init();

  const prisma = app.get(PrismaService);
  const http = () => {
    const agent = request(app.getHttpServer());
    const withIp =
      (verb: 'get' | 'post' | 'patch' | 'delete') => (url: string) =>
        agent[verb](url).set('X-Forwarded-For', nextClientIp());
    return {
      get: withIp('get'),
      post: withIp('post'),
      patch: withIp('patch'),
      delete: withIp('delete'),
    } as Pick<Agent, 'get' | 'post' | 'patch' | 'delete'>;
  };
  return { app, prisma, http };
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
