import { createHash, randomBytes } from 'crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Env } from '@shared/infrastructure/config/env.schema';
import {
  AccessTokenClaims,
  IssuedAccessToken,
  IssuedRefreshToken,
  TokenIssuer,
} from '../../domain';

const UNIT_SECONDS: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };

export const parseDurationSeconds = (raw: string): number => {
  const match = /^(\d+)\s*([smhd])$/.exec(raw.trim());
  if (!match) {
    const asNumber = Number(raw);
    if (Number.isFinite(asNumber)) return asNumber;
    throw new Error(`Invalid duration: "${raw}"`);
  }
  return Number(match[1]) * UNIT_SECONDS[match[2]];
};

@Injectable()
export class JwtTokenIssuer extends TokenIssuer {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
  ) {
    super();
  }

  async issueAccessToken(claims: AccessTokenClaims): Promise<IssuedAccessToken> {
    const expiresInSeconds = parseDurationSeconds(
      this.config.get('JWT_ACCESS_TTL', { infer: true }),
    );
    const token = await this.jwt.signAsync(
      {
        sub: claims.userId,
        email: claims.email,
        roles: claims.roles,
        permissions: claims.permissions,
        type: 'access',
      },
      {
        secret: this.config.get('JWT_ACCESS_SECRET', { infer: true }),
        expiresIn: expiresInSeconds,
      },
    );
    return { token, expiresInSeconds };
  }

  issueRefreshToken(userId: string): Promise<IssuedRefreshToken> {
    const raw = `${userId}.${randomBytes(48).toString('hex')}`;
    const ttl = parseDurationSeconds(this.config.get('JWT_REFRESH_TTL', { infer: true }));
    return Promise.resolve({
      token: raw,
      tokenHash: this.hashRefreshToken(raw),
      expiresAt: new Date(Date.now() + ttl * 1000),
    });
  }

  hashRefreshToken(token: string): string {
    const secret = this.config.get('JWT_REFRESH_SECRET', { infer: true });
    return createHash('sha256').update(`${secret}:${token}`).digest('hex');
  }
}
