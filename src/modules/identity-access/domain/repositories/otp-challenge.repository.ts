import { OtpChallenge } from '../entities/otp-challenge.entity';

export const OTP_CHALLENGE_REPOSITORY = Symbol('OTP_CHALLENGE_REPOSITORY');

export abstract class OtpChallengeRepository {
  abstract nextIdentity(): string;
  abstract save(challenge: OtpChallenge): Promise<void>;
  abstract findById(id: string): Promise<OtpChallenge | null>;
  /** Most recent non-consumed challenge for a user + purpose, if any. */
  abstract findLatestPending(userId: string, purpose: string): Promise<OtpChallenge | null>;
}
