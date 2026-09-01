import { Provider } from '@nestjs/common';
import {
  OTP_CHALLENGE_REPOSITORY,
  OtpChallengeRepository,
  PASSWORD_HASHER,
  PasswordHasher,
  REFRESH_TOKEN_REPOSITORY,
  RefreshTokenRepository,
  ROLE_CATALOG,
  RoleCatalogPort,
  TOKEN_ISSUER,
  TokenIssuer,
  USER_REPOSITORY,
  UserRepository,
} from '../domain';
import { PrismaUserRepository } from './persistence/prisma-user.repository';
import { PrismaOtpChallengeRepository } from './persistence/prisma-otp-challenge.repository';
import { PrismaRefreshTokenRepository } from './persistence/prisma-refresh-token.repository';
import { PrismaRoleCatalog } from './persistence/prisma-role-catalog';
import { Argon2PasswordHasher } from './security/argon2-password-hasher';
import { JwtTokenIssuer } from './security/jwt-token-issuer';

export const identityInfrastructureProviders: Provider[] = [
  PrismaUserRepository,
  PrismaOtpChallengeRepository,
  PrismaRefreshTokenRepository,
  PrismaRoleCatalog,
  Argon2PasswordHasher,
  JwtTokenIssuer,

  { provide: USER_REPOSITORY, useExisting: PrismaUserRepository },
  { provide: UserRepository, useExisting: PrismaUserRepository },
  { provide: OTP_CHALLENGE_REPOSITORY, useExisting: PrismaOtpChallengeRepository },
  { provide: OtpChallengeRepository, useExisting: PrismaOtpChallengeRepository },
  { provide: REFRESH_TOKEN_REPOSITORY, useExisting: PrismaRefreshTokenRepository },
  { provide: RefreshTokenRepository, useExisting: PrismaRefreshTokenRepository },
  { provide: ROLE_CATALOG, useExisting: PrismaRoleCatalog },
  { provide: RoleCatalogPort, useExisting: PrismaRoleCatalog },
  { provide: PASSWORD_HASHER, useExisting: Argon2PasswordHasher },
  { provide: PasswordHasher, useExisting: Argon2PasswordHasher },
  { provide: TOKEN_ISSUER, useExisting: JwtTokenIssuer },
  { provide: TokenIssuer, useExisting: JwtTokenIssuer },
];
