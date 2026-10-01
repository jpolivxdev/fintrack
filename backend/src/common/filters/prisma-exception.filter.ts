import {
  ArgumentsHost,
  Catch,
  ConflictException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { Prisma } from '../../generated/prisma/client.js';

/**
 * Translates known Prisma errors into HTTP errors so clients always receive
 * the standard `{ statusCode, message, error }` shape instead of a 500.
 */
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter extends BaseExceptionFilter {
  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    super.catch(this.map(exception) ?? exception, host);
  }

  private map(
    exception: Prisma.PrismaClientKnownRequestError,
  ): HttpException | undefined {
    switch (exception.code) {
      case 'P2002':
        return new ConflictException(
          'A record with these values already exists',
        );
      case 'P2003':
        return new ConflictException(
          'Operation violates a relation constraint',
        );
      case 'P2025':
        return new NotFoundException('Record not found');
      default:
        return undefined;
    }
  }
}
