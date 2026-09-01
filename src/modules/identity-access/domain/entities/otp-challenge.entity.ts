import { AbstractEntity, Clock, UnauthorizedException, ConflictException } from '@shared/kernel';
import { OtpCode } from '../value-objects/otp-code.vo';
import { PasswordHasher } from '../services/password-hasher';

export type OtpChannel = 'EMAIL';
export type OtpPurpose = 'LOGIN';

export interface OtpChallengeProps {
  userId: string;
  codeHash: string;
  channel: OtpChannel;
  purpose: OtpPurpose;
  expiresAt: Date;
  attempts: number;
  consumedAt: Date | null;
  createdAt: Date;
}

export interface IssueOtpInput {
  id: string;
  userId: string;
  code: OtpCode;
  hasher: PasswordHasher;
  clock: Clock;
  ttlSeconds: number;
  purpose?: OtpPurpose;
  channel?: OtpChannel;
}

export class OtpChallenge extends AbstractEntity<string> {
  private props: OtpChallengeProps;

  private constructor(id: string, props: OtpChallengeProps) {
    super(id);
    this.props = props;
  }

  static async issue(input: IssueOtpInput): Promise<OtpChallenge> {
    const now = input.clock.now();
    const codeHash = await input.hasher.hash(input.code.value);
    return new OtpChallenge(input.id, {
      userId: input.userId,
      codeHash,
      channel: input.channel ?? 'EMAIL',
      purpose: input.purpose ?? 'LOGIN',
      expiresAt: new Date(now.getTime() + input.ttlSeconds * 1000),
      attempts: 0,
      consumedAt: null,
      createdAt: now,
    });
  }

  static reconstitute(id: string, props: OtpChallengeProps): OtpChallenge {
    return new OtpChallenge(id, { ...props });
  }

  get userId(): string {
    return this.props.userId;
  }
  get purpose(): OtpPurpose {
    return this.props.purpose;
  }
  get attempts(): number {
    return this.props.attempts;
  }
  get expiresAt(): Date {
    return this.props.expiresAt;
  }
  get consumedAt(): Date | null {
    return this.props.consumedAt;
  }
  get codeHash(): string {
    return this.props.codeHash;
  }
  get channel(): OtpChannel {
    return this.props.channel;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }

  isExpired(clock: Clock): boolean {
    return clock.now().getTime() >= this.props.expiresAt.getTime();
  }

  isConsumed(): boolean {
    return this.props.consumedAt !== null;
  }

  hasReachedMaxAttempts(maxAttempts: number): boolean {
    return this.props.attempts >= maxAttempts;
  }

  registerFailedAttempt(): void {
    this.props.attempts += 1;
  }

  consume(clock: Clock): void {
    this.props.consumedAt = clock.now();
  }

  /**
   * Verifies a plaintext code against this challenge, mutating attempt state.
   * Throws a domain error on any failure; resolves (and consumes) on success.
   */
  async verify(
    plainCode: string,
    hasher: PasswordHasher,
    clock: Clock,
    maxAttempts: number,
  ): Promise<void> {
    if (this.isConsumed()) {
      throw new ConflictException('OTP_ALREADY_USED', 'This code has already been used');
    }
    if (this.isExpired(clock)) {
      throw new UnauthorizedException('OTP_EXPIRED', 'This code has expired');
    }
    if (this.hasReachedMaxAttempts(maxAttempts)) {
      throw new UnauthorizedException('OTP_MAX_ATTEMPTS', 'Too many invalid attempts');
    }
    const matches = await hasher.verify(plainCode, this.props.codeHash);
    if (!matches) {
      this.registerFailedAttempt();
      throw new UnauthorizedException('OTP_INVALID', 'Invalid code');
    }
    this.consume(clock);
  }
}
