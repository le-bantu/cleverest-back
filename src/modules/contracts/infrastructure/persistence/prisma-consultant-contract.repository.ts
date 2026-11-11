import { Injectable } from '@nestjs/common';
import { ConsultantContract as Row, Prisma } from '@prisma/client';
import { generateUuid, normalizePageQuery, Page, PageQuery } from '@shared/kernel';
import { PrismaService } from '@shared/infrastructure/database/prisma.service';
import {
  ConsultantContract,
  ConsultantContractAlreadyExists,
  ConsultantContractListFilter,
  ConsultantContractRepository,
} from '../../domain';

const SORTABLE = new Set(['createdAt', 'updatedAt', 'signedAt', 'amount']);

export const consultantContractToDomain = (row: Row): ConsultantContract =>
  ConsultantContract.rehydrate({
    id: row.id,
    quoteId: row.quoteId,
    rootQuoteId: row.rootQuoteId,
    consultantId: row.consultantId,
    amount: row.amount.toNumber(),
    createdById: row.createdById,
    originalFile: {
      key: row.originalFileKey,
      originalName: row.originalFileName,
      mimeType: row.originalMimeType,
      size: row.originalSize,
    },
    signedFile: row.signedFileKey
      ? {
          key: row.signedFileKey,
          originalName: row.signedFileName ?? 'contrat-signe.pdf',
          mimeType: row.signedMimeType,
          size: row.signedSize ?? 0,
        }
      : null,
    signedAt: row.signedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });

const toPersistence = (c: ConsultantContract) => ({
  quoteId: c.quoteId,
  rootQuoteId: c.rootQuoteId,
  consultantId: c.consultantId,
  amount: new Prisma.Decimal(c.amount),
  createdById: c.createdById,
  originalFileKey: c.originalFile.key,
  originalFileName: c.originalFile.originalName,
  originalMimeType: c.originalFile.mimeType,
  originalSize: c.originalFile.size,
  signedFileKey: c.signedFile?.key ?? null,
  signedFileName: c.signedFile?.originalName ?? null,
  signedMimeType: c.signedFile?.mimeType ?? null,
  signedSize: c.signedFile?.size ?? null,
  signedAt: c.signedAt,
  createdAt: c.createdAt,
  updatedAt: c.updatedAt,
});

@Injectable()
export class PrismaConsultantContractRepository extends ConsultantContractRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  nextIdentity(): string {
    return generateUuid();
  }

  async findById(id: string): Promise<ConsultantContract | null> {
    const row = await this.prisma.consultantContract.findUnique({ where: { id } });
    return row ? consultantContractToDomain(row) : null;
  }

  async existsFor(quoteId: string, consultantId: string): Promise<boolean> {
    return (await this.prisma.consultantContract.count({ where: { quoteId, consultantId } })) > 0;
  }

  async hasSigned(consultantId: string, rootQuoteId: string): Promise<boolean> {
    const count = await this.prisma.consultantContract.count({
      where: { consultantId, rootQuoteId, signedAt: { not: null } },
    });
    return count > 0;
  }

  async save(contract: ConsultantContract): Promise<void> {
    const data = toPersistence(contract);
    try {
      await this.prisma.consultantContract.upsert({
        where: { id: contract.id },
        create: { id: contract.id, ...data },
        update: data,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConsultantContractAlreadyExists(contract.quoteId, contract.consultantId);
      }
      throw error;
    }
  }

  async delete(id: string): Promise<void> {
    await this.prisma.consultantContract.deleteMany({ where: { id } });
  }

  async list(query: PageQuery, f: ConsultantContractListFilter): Promise<Page<ConsultantContract>> {
    const { page, perPage, sort } = normalizePageQuery(query);
    const where: Prisma.ConsultantContractWhereInput = {};
    if (f.consultantId) where.consultantId = f.consultantId;
    if (f.quoteId) where.quoteId = f.quoteId;
    if (f.rootQuoteId) where.rootQuoteId = f.rootQuoteId;
    if (f.signed !== undefined) where.signedAt = f.signed ? { not: null } : null;
    const [field, dir] = (sort ?? 'createdAt:desc').split(':');
    const orderBy = {
      [SORTABLE.has(field) ? field : 'createdAt']: dir === 'asc' ? 'asc' : 'desc',
    } as Prisma.ConsultantContractOrderByWithRelationInput;
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.consultantContract.count({ where }),
      this.prisma.consultantContract.findMany({
        where,
        orderBy: [orderBy, { id: 'asc' }],
        skip: (page - 1) * perPage,
        take: perPage,
      }),
    ]);
    return new Page(rows.map(consultantContractToDomain), total, { page, perPage });
  }
}
