import { Injectable } from '@nestjs/common';
import { UnitOfWorkPort } from '@shared/application/ports/unit-of-work.port';
import { PrismaService } from './prisma.service';

/**
 * Prisma implementation of UnitOfWorkPort. The `tx` handed to the callback is
 * a Prisma transaction client; repositories accept it as an optional executor.
 */
@Injectable()
export class PrismaUnitOfWork extends UnitOfWorkPort {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  run<T>(work: (tx: unknown) => Promise<T>): Promise<T> {
    return this.prisma.$transaction((tx) => work(tx));
  }
}
