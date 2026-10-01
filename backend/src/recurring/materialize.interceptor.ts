import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import type { Observable } from 'rxjs';
import type { AuthUser } from '../common/decorators/current-user.decorator.js';
import { RecurringService } from './recurring.service.js';

/**
 * Before any authenticated request is handled, due recurring occurrences of
 * the user's household become transactions. This replaces a cron job (the
 * free hosting tier sleeps when idle) and is throttled per household.
 */
@Injectable()
export class MaterializeRecurringInterceptor implements NestInterceptor {
  private readonly logger = new Logger(MaterializeRecurringInterceptor.name);

  constructor(private readonly recurring: RecurringService) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const user = context.switchToHttp().getRequest<{ user?: AuthUser }>().user;
    if (user?.householdId) {
      try {
        await this.recurring.materializeDue(user.householdId);
      } catch (error) {
        // Never fail the user's request because of background bookkeeping.
        this.logger.error('Recurring materialization failed', error instanceof Error ? error.stack : String(error));
      }
    }
    return next.handle();
  }
}
