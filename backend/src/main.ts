import { ConsoleLogger, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { setupApp, setupSwagger } from './setup-app.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    // Structured JSON logs in production: searchable/filterable on Render.
    logger:
      process.env.NODE_ENV === 'production'
        ? new ConsoleLogger({ json: true, colors: false })
        : undefined,
  });
  setupApp(app);
  setupSwagger(app);

  const port = app.get(ConfigService).get<number>('PORT', 3000);
  await app.listen(port, '0.0.0.0');
  Logger.log(`API ready on http://localhost:${port}/api — docs at /api/docs`, 'Bootstrap');
}
await bootstrap();
