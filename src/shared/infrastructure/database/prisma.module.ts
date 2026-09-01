import { Global, Module } from '@nestjs/common';
import { UNIT_OF_WORK, UnitOfWorkPort } from '@shared/application/ports/unit-of-work.port';
import { PrismaService } from './prisma.service';
import { PrismaUnitOfWork } from './prisma-unit-of-work';

@Global()
@Module({
  providers: [
    PrismaService,
    PrismaUnitOfWork,
    { provide: UNIT_OF_WORK, useExisting: PrismaUnitOfWork },
    { provide: UnitOfWorkPort, useExisting: PrismaUnitOfWork },
  ],
  exports: [PrismaService, PrismaUnitOfWork, UNIT_OF_WORK, UnitOfWorkPort],
})
export class PrismaModule {}
