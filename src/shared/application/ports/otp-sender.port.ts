export const OTP_SENDER = Symbol('OTP_SENDER');

export interface OtpMessage {
  email: string;
  code: string;
  purpose: string;
  ttlSeconds: number;
}

/** Delivers a freshly generated OTP code to the user (email channel for now). */
export abstract class OtpSenderPort {
  abstract send(message: OtpMessage): Promise<void>;
}
