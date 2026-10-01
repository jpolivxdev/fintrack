import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Prisma } from '../../generated/prisma/client.js';
import { SecurityLogger } from '../logging/security-logger.js';

interface ErrorBody {
  statusCode: number;
  message: string | string[];
  error?: string;
  requestId?: string;
}

/**
 * Single place where every error becomes an HTTP response.
 * - Expected errors (4xx) keep their message: the client needs it.
 * - Anything unexpected becomes a generic 500 with a requestId; the stack
 *   trace and details go to the server log only, never to the client.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  constructor(private readonly securityLogger: SecurityLogger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();
    const requestId = request.requestId;

    const body = this.toBody(exception);

    if (body.statusCode >= 500) {
      this.logger.error(
        `${request.method} ${request.originalUrl} failed [requestId=${requestId}]`,
        exception instanceof Error ? exception.stack : String(exception),
      );
      body.message = 'Internal server error';
      delete body.error;
      body.requestId = requestId;
    } else {
      this.securityLogger.logClientError(request, body.statusCode);
    }

    if (!response.headersSent) {
      response.status(body.statusCode).json(body);
    }
  }

  private toBody(exception: unknown): ErrorBody {
    if (exception instanceof HttpException) {
      const res = exception.getResponse();
      return typeof res === 'string'
        ? { statusCode: exception.getStatus(), message: res }
        : ({ statusCode: exception.getStatus(), ...(res as object) } as ErrorBody);
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      switch (exception.code) {
        case 'P2002':
          return { statusCode: 409, message: 'A record with these values already exists', error: 'Conflict' };
        case 'P2003':
          return { statusCode: 409, message: 'Operation violates a relation constraint', error: 'Conflict' };
        case 'P2025':
          return { statusCode: 404, message: 'Record not found', error: 'Not Found' };
      }
    }

    // body-parser / http-errors (malformed JSON, payload too large...): these
    // are client errors and their messages are safe to expose.
    if (isExposableHttpError(exception)) {
      return {
        statusCode: exception.status,
        message: exception.message,
        error: statusText(exception.status),
      };
    }

    return { statusCode: 500, message: 'Internal server error' };
  }
}

/** 413 -> "Payload Too Large", same wording Nest uses. */
function statusText(status: number): string {
  const name = HttpStatus[status] as string | undefined;
  if (!name) return 'Error';
  return name
    .split('_')
    .map((word) => word[0] + word.slice(1).toLowerCase())
    .join(' ');
}

function isExposableHttpError(
  error: unknown,
): error is { status: number; message: string } {
  if (typeof error !== 'object' || error === null) return false;
  const { status, expose } = error as { status?: unknown; expose?: unknown };
  return typeof status === 'number' && status >= 400 && status < 500 && expose === true;
}
