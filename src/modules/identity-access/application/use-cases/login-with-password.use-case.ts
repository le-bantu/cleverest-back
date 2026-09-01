import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Clock, CLOCK, UnauthorizedException } from '@shared/kernel';
import { OTP_SENDER, OtpSenderPort } from '@shared/application/ports/otp-sender.port';
import { UseCase } from '@shared/application/use-case';
import type { Env } from '@shared/infrastructure/config/env.schema';
import {
  OtpChallenge,
  OTP_CHALLENGE_REPOSITORY,
  OtpChallengeRepository,
  OtpCode,
  PasswordHasher,
  PASSWORD_HASHER,
  USER_REPOSITORY,
  UserRepository,
} from '../../domain';
import { LoginInput, LoginOutput } from '../dto/auth.dto';
import { SessionIssuerService } from '../services/session-issuer.service';

@Injectable()
export class LoginWithPasswordUseCase implements UseCase<LoginInput, LoginOutput> {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(OTP_CHALLENGE_REPOSITORY) private readonly otps: OtpChallengeRepository,
    @Inject(OTP_SENDER) private readonly otpSender: OtpSenderPort,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly session: SessionIssuerService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async execute(input: LoginInput): Promise<LoginOutput> {
    const invalid = new UnauthorizedException('INVALID_CREDENTIALS', 'Invalid email or password');

    const email = input.email?.trim().toLowerCase();
    const user = email ? await this.users.findByEmail(email) : null;
    if (!user) throw invalid;

    const matches = await this.hasher.verify(input.password ?? '', user.passwordHash);
    if (!matches) throw invalid;

    user.ensureCanAuthenticate();

    // transparent legacy bcrypt -> argon2 upgrade
    if (this.hasher.needsRehash(user.passwordHash)) {
      user.changePasswordHash(await this.hasher.hash(input.password));
      await this.users.save(user);
    }

    if (user.twoFactorEnabled) {
      const code = OtpCode.generate();
      const challenge = await OtpChallenge.issue({
        id: this.otps.nextIdentity(),
        userId: user.id,
        code,
        hasher: this.hasher,
        clock: this.clock,
        ttlSeconds: this.config.get('OTP_TTL_SECONDS', { infer: true }),
      });
      await this.otps.save(challenge);
      await this.otpSender.send({
        email: user.emailValue ?? '',
        code: code.value,
        purpose: 'LOGIN',
        ttlSeconds: this.config.get('OTP_TTL_SECONDS', { infer: true }),
      });
      return { otpRequired: true, challengeId: challenge.id };
    }

    const session = await this.session.issueFor(user, input.userAgent);
    return { otpRequired: false, ...session };
  }
}
