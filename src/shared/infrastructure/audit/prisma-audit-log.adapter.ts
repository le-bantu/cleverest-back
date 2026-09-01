import { Injectable } from '@nestjs/common';
import { AuditLogPort, AuditRecord } from '@shared/application/ports/audit-log.port';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class PrismaAuditLogAdapter extends AuditLogPort {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async record(entry: AuditRecord): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        entity: entry.entity,
        entityId: entry.entityId,
        action: entry.action,
        fromStatus: entry.fromStatus ?? null,
        toStatus: entry.toStatus ?? null,
        actorId: entry.actorId ?? null,
        metadata: (entry.metadata ?? undefined) as never,
      },
    });
  }
}
