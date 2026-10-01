import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { json, type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import { requestIdMiddleware } from './common/logging/request-id.middleware.js';

const DOCS_PATH = 'api/docs';

const sharedHelmet = {
  // HTTPS only for a year, subdomains included (browsers remember this).
  hsts: { maxAge: 31_536_000, includeSubDomains: true, preload: false },
  frameguard: { action: 'deny' as const }, // no clickjacking via <iframe>
  noSniff: true, // never guess a content type (JSON stays JSON)
  referrerPolicy: { policy: 'no-referrer' as const },
  hidePoweredBy: true,
};

/** The API only returns JSON: nothing may load, run or embed anything. */
const apiHelmet = helmet({
  ...sharedHelmet,
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'none'"],
      formAction: ["'none'"],
    },
  },
});

/** Swagger UI is a real page: allow only its own assets. */
const docsHelmet = helmet({
  ...sharedHelmet,
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"], // Swagger UI injects inline styles
      imgSrc: ["'self'", 'data:'],
      fontSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
    },
  },
});

/**
 * Global app configuration, shared by `main.ts` and the e2e tests so both run
 * exactly the same pipeline.
 */
export function setupApp(app: INestApplication): void {
  const config = app.get(ConfigService);
  const expressApp = app as NestExpressApplication;

  // Behind Render's proxy chain, trust exactly its hops so req.ip is the
  // client IP (the rate-limit key) and X-Forwarded-For cannot be spoofed.
  const proxyHops = config.get<number>('TRUST_PROXY_HOPS', 0);
  if (proxyHops > 0) expressApp.set('trust proxy', proxyHops);

  app.use(requestIdMiddleware);
  app.use((req: Request, res: Response, next: NextFunction) =>
    req.path.startsWith(`/${DOCS_PATH}`) ? docsHelmet(req, res, next) : apiHelmet(req, res, next),
  );
  app.enableCors({
    origin: parseOrigins(config.get<string>('CORS_ORIGINS')),
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id', 'Retry-After-credentials', 'Retry-After-global'],
    // Tokens travel in the Authorization header, never in cookies.
    credentials: false,
    maxAge: 600,
  });

  // The largest legit payload is ~1 KB; anything far beyond that is abuse.
  // Only statement imports (up to 500 rows) get a larger allowance.
  expressApp.use('/api/transactions/import', json({ limit: '512kb' }));
  expressApp.useBodyParser('json', { limit: '32kb' });

  app.setGlobalPrefix('api', { exclude: ['/'] });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // strip unknown properties
      forbidNonWhitelisted: true, // ...and reject requests that send them
      transform: true, // turn payloads into DTO instances
    }),
  );
  app.enableShutdownHooks();
}

/** Explicit allowlist; an empty list means no cross-origin access at all. */
export function parseOrigins(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
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
      .addTag('Household', 'Shared household (e.g. a couple): members, invites, join and leave')
      .addTag('Accounts', 'Checking, savings, credit card, cash and investment accounts with balances')
      .addTag('Transfers', 'Money moving between accounts (never counted as income/expense)')
      .addTag('Recurring', 'Rules that create transactions automatically (salary, rent, subscriptions)')
      .addTag('Goals', 'Savings goals with contributions, pace and projected completion')
      .addTag('Calendar', 'Shared household calendar: events (shared or private) and recurring bills')
      .addTag('Categories', 'Income and expense categories')
      .addTag('Transactions', 'Income and expense records')
      .addTag('Budgets', 'Monthly spending limits per category')
      .addTag('Reports', 'Aggregated financial reports')
      .addTag('Insights', 'Automatic, structured observations about a month')
      .addTag('Health', 'Service status')
      .build(),
  );
  SwaggerModule.setup(DOCS_PATH, app, document, {
    customSiteTitle: 'FinTrack API Docs',
    swaggerOptions: { persistAuthorization: true },
  });
}
