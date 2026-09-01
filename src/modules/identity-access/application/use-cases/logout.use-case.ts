import { Inject, Injectable } from '@nestjs/common';
import { Clock, CLOCK } from '@shared/kernel';
import { UseCase } from '@shared/application/use-case';
import {
  REFRESH_TOKEN_REPOSITORY,
  RefreshTokenRepository,
  TokenIssuer,
  TOKEN_ISSUER,
} from '../../domain';
import { LogoutInput } from '../dto/auth.dto';

@Injectable()
export class LogoutUseCase implements UseCase<LogoutInput, void> {
  constructor(
    @Inject(REFRESH_TOKEN_REPOSITORY) private readonly refreshTokens: RefreshTokenRepository,
    @Inject(TOKEN_ISSUER) private readonly tokens: TokenIssuer,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: LogoutInput): Promise<void> {
    if (!input.refreshToken) return;
    const stored = await this.refreshTokens.findByTokenHash(
      this.tokens.hashRefreshToken(input.refreshToken),
    );
    // idempotent; only revoke a token that belongs to the caller
    if (stored && stored.userId === input.actorUserId && !stored.isRevoked()) {
      stored.revoke(this.clock);
      await this.refreshTokens.save(stored);
    }
  }
}
