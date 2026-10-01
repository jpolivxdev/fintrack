import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpAdapterHost } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter.js';

/**
 * Global app configuration, shared by `main.ts` and the e2e tests so both run
 * exactly the same pipeline.
 */
export function setupApp(app: INestApplication): void {
  const config = app.get(ConfigService);

  // The largest legit payload is ~1 KB; anything far beyond that is abuse.
  (app as NestExpressApplication).useBodyParser('json', { limit: '32kb' });

  // Behind Render's proxy, trust exactly its hop so req.ip is the client IP
  // (used as the rate-limit key) and X-Forwarded-For cannot be spoofed.
  const proxyHops = config.get<number>('TRUST_PROXY_HOPS', 0);
  if (proxyHops > 0) {
    (app as NestExpressApplication).set('trust proxy', proxyHops);
  }

  app.setGlobalPrefix('api', { exclude: ['/'] });
  app.use(helmet());
  app.enableCors({
    origin: (config.get<string>('CORS_ORIGINS') ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // strip unknown properties
      forbidNonWhitelisted: true, // ...and reject requests that send them
      transform: true, // turn payloads into DTO instances
    }),
  );
  app.useGlobalFilters(
    new PrismaExceptionFilter(app.get(HttpAdapterHost).httpAdapter),
  );
  app.enableShutdownHooks();
}

export function setupSwagger(app: INestApplication): void {
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('FinTrack API')
      .setDescription(
        [
          'REST API for **FinTrack**, a personal finance tracker.',
          '',
          '**How to try it:** call `POST /api/auth/login` with the demo account',
          '(`demo@fintrack.dev` / `Demo@1234`), copy the `accessToken`, click',
          '**Authorize** and paste it. Every other endpoint is then unlocked.',
          '',
          'Money values are returned as strings with 2 decimals (e.g. `"1234.50"`)',
          'to avoid floating-point errors.',
        ].join('\n'),
      )
      .setVersion('1.0.0')
      .addBearerAuth()
      .addTag('Auth', 'Registration, login and session management')
      .addTag('Categories', 'Income and expense categories')
      .addTag('Transactions', 'Income and expense records')
      .addTag('Budgets', 'Monthly spending limits per category')
      .addTag('Reports', 'Aggregated financial insights')
      .addTag('Health', 'Service status')
      .build(),
  );
  SwaggerModule.setup('api/docs', app, document, {
    customSiteTitle: 'FinTrack API Docs',
    swaggerOptions: { persistAuthorization: true },
  });
}
