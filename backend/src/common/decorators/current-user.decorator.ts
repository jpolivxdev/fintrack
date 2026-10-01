import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/** Shape attached to `request.user` by the JWT strategy. */
export interface AuthUser {
  id: string;
  email: string;
}

/** Injects the authenticated user (or one of its fields) into a handler. */
export const CurrentUser = createParamDecorator(
  (field: keyof AuthUser | undefined, ctx: ExecutionContext) => {
    const user = ctx.switchToHttp().getRequest<{ user: AuthUser }>().user;
    return field ? user[field] : user;
  },
);
