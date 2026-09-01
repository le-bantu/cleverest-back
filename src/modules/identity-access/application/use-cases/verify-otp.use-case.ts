import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Clock, CLOCK, NotFoundException } from '@shared/kernel';
import { UseCase } from '@shared/application/use-case';
import type { Env } from '@shared/infrastructure/config/env.schema';
import {
  OTP_CHALLENGE_REPOSITORY,
  OtpChallengeRepository,
  PasswordHasher,
  PASSWORD_HASHER,
  USER_REPOSITORY,
  UserRepository,
} from '../../domain';
import { TokenPairOutput, VerifyOtpInput } from '../dto/auth.dto';
import { SessionIssuerService } from '../services/session-issuer.service';

@Injectable()
export class VerifyOtpUseCase implements UseCase<VerifyOtpInput, TokenPairOutput> {
  constructor(
    @Inject(OTP_CHALLENGE_REPOSITORY) private readonly otps: OtpChallengeRepository,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly session: SessionIssuerService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async execute(input: VerifyOtpInput): Promise<TokenPairOutput> {
    const challenge = await this.otps.findById(input.challengeId);
    if (!challenge) {
      throw new NotFoundException('OTP_CHALLENGE_NOT_FOUND', 'Unknown or expired challenge');
    }

    const user = await this.users.findById(challenge.userId);
    if (!user) {
      throw new NotFoundException('OTP_CHALLENGE_NOT_FOUND', 'Unknown or expired challenge');
    }
    user.ensureCanAuthenticate();

    try {
      await challenge.verify(
        input.code,
        this.hasher,
        this.clock,
        this.config.get('OTP_MAX_ATTEMPTS', { infer: true }),
      );
    } finally {
      await this.otps.save(challenge);
    }

    const session = await this.session.issueFor(user, input.userAgent);
    return { otpRequired: false, ...session };
  }
}
