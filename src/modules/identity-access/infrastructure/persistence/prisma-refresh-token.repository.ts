import { Injectable } from '@nestjs/common';
import { RefreshToken as RefreshRow } from '@prisma/client';
import { generateUuid } from '@shared/kernel';
import { PrismaService } from '@shared/infrastructure/database/prisma.service';
import { RefreshToken, RefreshTokenRepository } from '../../domain';

const toDomain = (row: RefreshRow): RefreshToken =>
  RefreshToken.reconstitute(row.id, {
    userId: row.userId,
    tokenHash: row.tokenHash,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
    userAgent: row.userAgent,
    createdAt: row.createdAt,
  });

@Injectable()
export class PrismaRefreshTokenRepository extends RefreshTokenRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  nextIdentity(): string {
    return generateUuid();
  }

  async save(token: RefreshToken): Promise<void> {
    const data = {
      userId: token.userId,
      tokenHash: token.tokenHash,
      expiresAt: token.expiresAt,
      revokedAt: token.revokedAt,
      userAgent: token.userAgent,
      createdAt: token.createdAt,
    };
    await this.prisma.refreshToken.upsert({
      where: { id: token.id },
      create: { id: token.id, ...data },
      update: { revokedAt: data.revokedAt },
    });
  }

  async findByTokenHash(tokenHash: string): Promise<RefreshToken | null> {
    const row = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });
    return row ? toDomain(row) : null;
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
