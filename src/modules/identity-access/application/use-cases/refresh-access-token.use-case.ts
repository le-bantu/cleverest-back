import { Inject, Injectable } from '@nestjs/common';
import { Clock, CLOCK, UnauthorizedException } from '@shared/kernel';
import { UseCase } from '@shared/application/use-case';
import {
  REFRESH_TOKEN_REPOSITORY,
  RefreshTokenRepository,
  TokenIssuer,
  TOKEN_ISSUER,
  USER_REPOSITORY,
  UserRepository,
} from '../../domain';
import { RefreshInput, TokenPairOutput } from '../dto/auth.dto';
import { SessionIssuerService } from '../services/session-issuer.service';

@Injectable()
export class RefreshAccessTokenUseCase implements UseCase<RefreshInput, TokenPairOutput> {
  constructor(
    @Inject(REFRESH_TOKEN_REPOSITORY) private readonly refreshTokens: RefreshTokenRepository,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(TOKEN_ISSUER) private readonly tokens: TokenIssuer,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly session: SessionIssuerService,
  ) {}

  async execute(input: RefreshInput): Promise<TokenPairOutput> {
    const invalid = new UnauthorizedException('REFRESH_TOKEN_INVALID', 'Invalid refresh token');

    const hash = this.tokens.hashRefreshToken(input.refreshToken ?? '');
    const stored = await this.refreshTokens.findByTokenHash(hash);
    if (!stored || !stored.isActive(this.clock)) {
      throw invalid;
    }

    // rotation: the presented token is single-use
    stored.revoke(this.clock);
    await this.refreshTokens.save(stored);

    const user = await this.users.findById(stored.userId);
    if (!user) throw invalid;
    user.ensureCanAuthenticate();

    const session = await this.session.issueFor(user, input.userAgent);
    return { otpRequired: false, ...session };
  }
}
