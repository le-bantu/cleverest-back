import { Injectable } from '@nestjs/common';
import { ConsultantInvoice as Row, Prisma } from '@prisma/client';
import { generateUuid, normalizePageQuery, Page, PageQuery } from '@shared/kernel';
import { PrismaService } from '@shared/infrastructure/database/prisma.service';
import {
  ConsultantInvoice,
  ConsultantInvoiceListFilter,
  ConsultantInvoiceRepository,
} from '../../domain';

const SORTABLE = new Set(['uploadedAt', 'paidAt', 'amount']);

export const consultantInvoiceToDomain = (row: Row): ConsultantInvoice =>
  ConsultantInvoice.rehydrate({
    id: row.id,
    consultantId: row.consultantId,
    missionId: row.missionId,
    quoteId: row.quoteId,
    amount: row.amount.toNumber(),
    file: { key: row.fileKey, originalName: row.fileName, mimeType: row.mimeType, size: row.size },
    uploadedAt: row.uploadedAt,
    paidAt: row.paidAt,
    paidById: row.paidById,
  });

const toPersistence = (i: ConsultantInvoice) => ({
  consultantId: i.consultantId,
  missionId: i.missionId,
  quoteId: i.quoteId,
  amount: new Prisma.Decimal(i.amount),
  fileKey: i.file.key,
  fileName: i.file.originalName,
  mimeType: i.file.mimeType,
  size: i.file.size,
  uploadedAt: i.uploadedAt,
  paidAt: i.paidAt,
  paidById: i.paidById,
});

@Injectable()
export class PrismaConsultantInvoiceRepository extends ConsultantInvoiceRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  nextIdentity(): string {
    return generateUuid();
  }

  async findById(id: string): Promise<ConsultantInvoice | null> {
    const row = await this.prisma.consultantInvoice.findUnique({ where: { id } });
    return row ? consultantInvoiceToDomain(row) : null;
  }

  async totalInvoiced(consultantId: string, quoteId: string): Promise<number> {
    const agg = await this.prisma.consultantInvoice.aggregate({
      where: { consultantId, quoteId },
      _sum: { amount: true },
    });
    return agg._sum.amount?.toNumber() ?? 0;
  }

  async save(invoice: ConsultantInvoice): Promise<void> {
    const data = toPersistence(invoice);
    await this.prisma.consultantInvoice.upsert({
      where: { id: invoice.id },
      create: { id: invoice.id, ...data },
      update: data,
    });
  }

  async list(query: PageQuery, f: ConsultantInvoiceListFilter): Promise<Page<ConsultantInvoice>> {
    const { page, perPage, sort } = normalizePageQuery(query);
    const where: Prisma.ConsultantInvoiceWhereInput = {};
    if (f.consultantId) where.consultantId = f.consultantId;
    if (f.missionId) where.missionId = f.missionId;
    if (f.isPaid !== undefined) where.paidAt = f.isPaid ? { not: null } : null;
    if (f.uploadedFrom || f.uploadedTo) {
      where.uploadedAt = {
        ...(f.uploadedFrom ? { gte: f.uploadedFrom } : {}),
        ...(f.uploadedTo ? { lte: f.uploadedTo } : {}),
      };
    }
    const [field, dir] = (sort ?? 'uploadedAt:desc').split(':');
    const orderBy = {
      [SORTABLE.has(field) ? field : 'uploadedAt']: dir === 'asc' ? 'asc' : 'desc',
    } as Prisma.ConsultantInvoiceOrderByWithRelationInput;
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.consultantInvoice.count({ where }),
      this.prisma.consultantInvoice.findMany({
        where,
        orderBy: [orderBy, { id: 'asc' }],
        skip: (page - 1) * perPage,
        take: perPage,
      }),
    ]);
    return new Page(rows.map(consultantInvoiceToDomain), total, { page, perPage });
  }
}
