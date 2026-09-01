import { Injectable } from '@nestjs/common';
import { OtpChallenge as OtpRow } from '@prisma/client';
import { generateUuid } from '@shared/kernel';
import { PrismaService } from '@shared/infrastructure/database/prisma.service';
import { OtpChallenge, OtpChallengeRepository } from '../../domain';

const toDomain = (row: OtpRow): OtpChallenge =>
  OtpChallenge.reconstitute(row.id, {
    userId: row.userId,
    codeHash: row.codeHash,
    channel: row.channel,
    purpose: row.purpose,
    expiresAt: row.expiresAt,
    attempts: row.attempts,
    consumedAt: row.consumedAt,
    createdAt: row.createdAt,
  });

@Injectable()
export class PrismaOtpChallengeRepository extends OtpChallengeRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  nextIdentity(): string {
    return generateUuid();
  }

  async save(challenge: OtpChallenge): Promise<void> {
    const data = {
      userId: challenge.userId,
      codeHash: challenge.codeHash,
      channel: challenge.channel,
      purpose: challenge.purpose,
      expiresAt: challenge.expiresAt,
      attempts: challenge.attempts,
      consumedAt: challenge.consumedAt,
      createdAt: challenge.createdAt,
    };
    await this.prisma.otpChallenge.upsert({
      where: { id: challenge.id },
      create: { id: challenge.id, ...data },
      update: { attempts: data.attempts, consumedAt: data.consumedAt },
    });
  }

  async findById(id: string): Promise<OtpChallenge | null> {
    const row = await this.prisma.otpChallenge.findUnique({ where: { id } });
    return row ? toDomain(row) : null;
  }

  async findLatestPending(userId: string, purpose: string): Promise<OtpChallenge | null> {
    const row = await this.prisma.otpChallenge.findFirst({
      where: { userId, purpose: purpose as OtpRow['purpose'], consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    return row ? toDomain(row) : null;
  }
}
