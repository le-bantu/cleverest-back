import { Injectable } from '@nestjs/common';
import { $Enums } from '@prisma/client';
import { PrismaService } from '@shared/infrastructure/database/prisma.service';
import { ConsultantWorkloadPort } from '../../domain';

const CLOSED: $Enums.QuoteStatus[] = ['SIGNE_CLIENT', 'REJETE'];

/** Load = number of open (non-terminal) quotes a consultant is assigned to. Missions join in Lot 3. */
@Injectable()
export class PrismaConsultantWorkloadAdapter extends ConsultantWorkloadPort {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async currentLoad(consultantIds: readonly string[]): Promise<Map<string, number>> {
    if (consultantIds.length === 0) return new Map();
    const groups = await this.prisma.quoteConsultant.groupBy({
      by: ['consultantId'],
      where: { consultantId: { in: [...consultantIds] }, quote: { status: { notIn: CLOSED } } },
      _count: { _all: true },
    });
    return new Map(groups.map((g) => [g.consultantId, g._count._all]));
  }
}
