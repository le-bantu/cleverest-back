import { UserView } from '../views/user.view';

export interface RegisterUserInput {
  email: string;
  password: string;
  role: string;
  phone?: string | null;
}
export interface RegisterUserOutput {
  userId: string;
}

export interface LoginInput {
  email: string;
  password: string;
  userAgent?: string | null;
}

export interface TokenPairOutput {
  otpRequired: false;
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
  user: UserView;
}
export interface OtpRequiredOutput {
  otpRequired: true;
  challengeId: string;
}
export type LoginOutput = TokenPairOutput | OtpRequiredOutput;

export interface VerifyOtpInput {
  challengeId: string;
  code: string;
  userAgent?: string | null;
}

export interface ResendOtpInput {
  challengeId: string;
}
export interface ResendOtpOutput {
  challengeId: string;
}

export interface RefreshInput {
  refreshToken: string;
  userAgent?: string | null;
}

export interface LogoutInput {
  actorUserId: string;
  refreshToken: string;
}
