import { Global, Module } from '@nestjs/common';
import { AUDIT_LOG, AuditLogPort } from '@shared/application/ports/audit-log.port';
import { PrismaAuditLogAdapter } from './prisma-audit-log.adapter';

@Global()
@Module({
  providers: [
    PrismaAuditLogAdapter,
    { provide: AUDIT_LOG, useExisting: PrismaAuditLogAdapter },
    { provide: AuditLogPort, useExisting: PrismaAuditLogAdapter },
  ],
  exports: [AUDIT_LOG, AuditLogPort],
})
export class AuditModule {}
