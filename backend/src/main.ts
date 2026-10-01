import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { setupApp, setupSwagger } from './setup-app.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  setupApp(app);
  setupSwagger(app);

  // Render/Railway put the app behind a proxy: trust it so rate limiting
  // sees the real client IP instead of the proxy's.
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  const port = app.get(ConfigService).get<number>('PORT', 3000);
  await app.listen(port, '0.0.0.0');
  Logger.log(`API ready on http://localhost:${port}/api — docs at /api/docs`, 'Bootstrap');
}
await bootstrap();
