import { Injectable } from '@nestjs/common';
import { $Enums } from '@prisma/client';
import { PrismaService } from '@shared/infrastructure/database/prisma.service';
import { ConsultantWorkloadPort } from '../../domain';

const CLOSED_QUOTES: $Enums.QuoteStatus[] = ['SIGNE_CLIENT', 'REJETE'];
const OPEN_MISSIONS: $Enums.MissionStatus[] = ['EN_ATTENTE', 'EN_COURS', 'EN_VALIDATION'];

/**
 * Load = open (non-terminal) quotes + open missions the consultant is assigned to.
 * Read-only projection over the missions table (no module dependency quotes → missions,
 * which would be circular since missions read the quote lead).
 */
@Injectable()
export class PrismaConsultantWorkloadAdapter extends ConsultantWorkloadPort {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async currentLoad(consultantIds: readonly string[]): Promise<Map<string, number>> {
    if (consultantIds.length === 0) return new Map();
    const ids = [...consultantIds];
    const [quotes, missions] = await Promise.all([
      this.prisma.quoteConsultant.groupBy({
        by: ['consultantId'],
        where: { consultantId: { in: ids }, quote: { status: { notIn: CLOSED_QUOTES } } },
        _count: { _all: true },
      }),
      this.prisma.missionConsultant.groupBy({
        by: ['consultantId'],
        where: { consultantId: { in: ids }, mission: { status: { in: OPEN_MISSIONS } } },
        _count: { _all: true },
      }),
    ]);
    const load = new Map<string, number>();
    for (const g of [...quotes, ...missions]) {
      load.set(g.consultantId, (load.get(g.consultantId) ?? 0) + g._count._all);
    }
    return load;
  }
}
