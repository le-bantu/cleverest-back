import { Injectable } from '@nestjs/common';
import { Payment as Row, Prisma } from '@prisma/client';
import { generateUuid, normalizePageQuery, Page, PageQuery } from '@shared/kernel';
import { PrismaService } from '@shared/infrastructure/database/prisma.service';
import { Payment, PaymentListFilter, PaymentRepository } from '../../domain';

const SORTABLE = new Set(['createdAt', 'updatedAt', 'validatedAt', 'amount']);

export const paymentToDomain = (row: Row): Payment =>
  Payment.rehydrate({
    id: row.id,
    missionId: row.missionId,
    clientId: row.clientId,
    amount: row.amount.toNumber(),
    proofFile: {
      key: row.proofFileKey,
      originalName: row.proofFileName,
      mimeType: row.proofMimeType,
      size: row.proofSize,
    },
    validatedAt: row.validatedAt,
    validatedById: row.validatedById,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });

const toPersistence = (p: Payment) => ({
  missionId: p.missionId,
  clientId: p.clientId,
  amount: new Prisma.Decimal(p.amount),
  proofFileKey: p.proofFile.key,
  proofFileName: p.proofFile.originalName,
  proofMimeType: p.proofFile.mimeType,
  proofSize: p.proofFile.size,
  validatedAt: p.validatedAt,
  validatedById: p.validatedById,
  createdAt: p.createdAt,
  updatedAt: p.updatedAt,
});

@Injectable()
export class PrismaPaymentRepository extends PaymentRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  nextIdentity(): string {
    return generateUuid();
  }

  async findById(id: string): Promise<Payment | null> {
    const row = await this.prisma.payment.findUnique({ where: { id } });
    return row ? paymentToDomain(row) : null;
  }

  async save(payment: Payment): Promise<void> {
    const data = toPersistence(payment);
    await this.prisma.payment.upsert({
      where: { id: payment.id },
      create: { id: payment.id, ...data },
      update: data,
    });
  }

  async list(query: PageQuery, f: PaymentListFilter): Promise<Page<Payment>> {
    const { page, perPage, sort } = normalizePageQuery(query);
    const where: Prisma.PaymentWhereInput = {};
    if (f.clientId) where.clientId = f.clientId;
    if (f.missionIds) where.missionId = { in: f.missionIds };
    if (f.missionId) where.AND = [{ missionId: f.missionId }];
    if (f.isValidated !== undefined) where.validatedAt = f.isValidated ? { not: null } : null;
    if (f.uploadedFrom || f.uploadedTo) {
      where.createdAt = {
        ...(f.uploadedFrom ? { gte: f.uploadedFrom } : {}),
        ...(f.uploadedTo ? { lte: f.uploadedTo } : {}),
      };
    }
    const [field, dir] = (sort ?? 'createdAt:desc').split(':');
    const orderBy = {
      [SORTABLE.has(field) ? field : 'createdAt']: dir === 'asc' ? 'asc' : 'desc',
    } as Prisma.PaymentOrderByWithRelationInput;
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.payment.count({ where }),
      this.prisma.payment.findMany({
        where,
        orderBy: [orderBy, { id: 'asc' }],
        skip: (page - 1) * perPage,
        take: perPage,
      }),
    ]);
    return new Page(rows.map(paymentToDomain), total, { page, perPage });
  }
}
