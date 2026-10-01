import { Global, Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { AllExceptionsFilter } from './filters/all-exceptions.filter.js';
import { SecurityLogger } from './logging/security-logger.js';

/** Cross-cutting providers available to every module. */
@Global()
@Module({
  providers: [SecurityLogger, { provide: APP_FILTER, useClass: AllExceptionsFilter }],
  exports: [SecurityLogger],
})
export class CommonModule {}
