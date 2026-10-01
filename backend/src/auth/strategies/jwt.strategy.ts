import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { JWT_ALGORITHM } from '../auth.constants.js';
import type { AccessTokenPayload } from '../auth.service.js';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      // Pinning the algorithm blocks "alg: none" and algorithm-confusion tricks.
      algorithms: [JWT_ALGORITHM],
    });
  }

  /**
   * Runs after the signature and expiry checks pass. A valid signature is not
   * enough: the account must still exist, so tokens of a deleted user stop
   * working immediately instead of living until they expire.
   * Cost: one primary-key lookup (with the membership join) per request.
   */
  async validate(payload: AccessTokenPayload): Promise<AuthUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, membership: { select: { householdId: true } } },
    });
    if (!user?.membership) throw new UnauthorizedException();
    // Membership is read fresh, so leaving or being removed from a household
    // takes effect immediately, not when the token expires.
    return { id: user.id, email: user.email, householdId: user.membership.householdId };
  }
}
