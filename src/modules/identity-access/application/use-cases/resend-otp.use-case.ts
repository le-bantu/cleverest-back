import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Clock, CLOCK, ConflictException, NotFoundException } from '@shared/kernel';
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
import { ResendOtpInput, ResendOtpOutput } from '../dto/auth.dto';

@Injectable()
export class ResendOtpUseCase implements UseCase<ResendOtpInput, ResendOtpOutput> {
  constructor(
    @Inject(OTP_CHALLENGE_REPOSITORY) private readonly otps: OtpChallengeRepository,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(OTP_SENDER) private readonly otpSender: OtpSenderPort,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async execute(input: ResendOtpInput): Promise<ResendOtpOutput> {
    const previous = await this.otps.findById(input.challengeId);
    if (!previous) {
      throw new NotFoundException('OTP_CHALLENGE_NOT_FOUND', 'Unknown challenge');
    }
    if (previous.isConsumed()) {
      throw new ConflictException('OTP_ALREADY_USED', 'This challenge is already completed');
    }

    const cooldown = this.config.get('OTP_RESEND_COOLDOWN_SECONDS', { infer: true });
    const elapsed = (this.clock.now().getTime() - previous.createdAt.getTime()) / 1000;
    if (elapsed < cooldown) {
      throw new ConflictException('OTP_RESEND_TOO_SOON', `Wait ${Math.ceil(cooldown - elapsed)}s`);
    }

    const user = await this.users.findById(previous.userId);
    if (!user) {
      throw new NotFoundException('OTP_CHALLENGE_NOT_FOUND', 'Unknown challenge');
    }
    user.ensureCanAuthenticate();

    const ttl = this.config.get('OTP_TTL_SECONDS', { infer: true });
    const code = OtpCode.generate();
    const fresh = await OtpChallenge.issue({
      id: this.otps.nextIdentity(),
      userId: user.id,
      code,
      hasher: this.hasher,
      clock: this.clock,
      ttlSeconds: ttl,
      purpose: previous.purpose,
      channel: previous.channel,
    });
    await this.otps.save(fresh);
    await this.otpSender.send({
      email: user.emailValue ?? '',
      code: code.value,
      purpose: fresh.purpose,
      ttlSeconds: ttl,
    });

    return { challengeId: fresh.id };
  }
}
