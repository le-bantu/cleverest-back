import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@shared/infrastructure/database/prisma.service';
import { ConsultantCandidate, ConsultantDirectoryPort } from '../../domain';

const consultantWhere: Prisma.UserWhereInput = {
  isActive: true,
  deletedAt: null,
  roles: { some: { role: { name: 'consultant' } } },
};

/**
 * Read-only adapter onto identity-access tables (tolerated: explicit port,
 * no write, no import of the other module's repository).
 */
@Injectable()
export class PrismaConsultantDirectoryAdapter extends ConsultantDirectoryPort {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  listConsultants(): Promise<ConsultantCandidate[]> {
    return this.query(consultantWhere);
  }

  findConsultantsByIds(ids: readonly string[]): Promise<ConsultantCandidate[]> {
    if (ids.length === 0) return Promise.resolve([]);
    return this.query({ ...consultantWhere, id: { in: [...ids] } });
  }

  private async query(where: Prisma.UserWhereInput): Promise<ConsultantCandidate[]> {
    const rows = await this.prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        consultantProfile: {
          select: { firstName: true, lastName: true, expertiseDomains: true, validated: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((r) => {
      const p = r.consultantProfile;
      const fullName = [p?.firstName, p?.lastName].filter(Boolean).join(' ').trim();
      return {
        consultantId: r.id,
        name: fullName || r.email || r.id,
        expertiseDomains: p?.expertiseDomains ?? [],
        validated: p?.validated ?? false,
      };
    });
  }
}
