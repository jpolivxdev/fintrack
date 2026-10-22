import { Injectable } from '@nestjs/common';
import { ThrottlerGuard, type ThrottlerRequest } from '@nestjs/throttler';

/**
 * Per-user requests-per-minute on the AI routes. Runs at controller level,
 * after authentication, so `request.user` exists and the bucket is the user
 * (not the IP). Only the `ai` throttler: the others already ran globally.
 */
@Injectable()
export class AiThrottlerGuard extends ThrottlerGuard {
  protected override handleRequest(requestProps: ThrottlerRequest): Promise<boolean> {
    if (requestProps.throttler.name !== 'ai') return Promise.resolve(true);
    return super.handleRequest(requestProps);
  }
}
