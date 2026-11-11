import { Injectable } from '@nestjs/common';
import { Contract as ContractRow, Prisma } from '@prisma/client';
import { generateUuid, normalizePageQuery, Page, PageQuery } from '@shared/kernel';
import { PrismaService } from '@shared/infrastructure/database/prisma.service';
import {
  Contract,
  ContractAlreadyExists,
  ContractListFilter,
  ContractRepository,
} from '../../domain';

type Tx = Prisma.TransactionClient;
const SORTABLE = new Set(['createdAt', 'updatedAt', 'signedAt']);

export const contractToDomain = (row: ContractRow): Contract =>
  Contract.rehydrate({
    id: row.id,
    quoteId: row.quoteId,
    clientId: row.clientId,
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
    signed: row.signed,
    signedAt: row.signedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });

const toPersistence = (c: Contract) => ({
  quoteId: c.quoteId,
  clientId: c.clientId,
  createdById: c.createdById,
  originalFileKey: c.originalFile.key,
  originalFileName: c.originalFile.originalName,
  originalMimeType: c.originalFile.mimeType,
  originalSize: c.originalFile.size,
  signedFileKey: c.signedFile?.key ?? null,
  signedFileName: c.signedFile?.originalName ?? null,
  signedMimeType: c.signedFile?.mimeType ?? null,
  signedSize: c.signedFile?.size ?? null,
  signed: c.signed,
  signedAt: c.signedAt,
  createdAt: c.createdAt,
  updatedAt: c.updatedAt,
});

@Injectable()
export class PrismaContractRepository extends ContractRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  nextIdentity(): string {
    return generateUuid();
  }

  async findById(id: string): Promise<Contract | null> {
    const row = await this.prisma.contract.findUnique({ where: { id } });
    return row ? contractToDomain(row) : null;
  }

  async existsForQuote(quoteId: string): Promise<boolean> {
    return (await this.prisma.contract.count({ where: { quoteId } })) > 0;
  }

  async save(contract: Contract, tx?: unknown): Promise<void> {
    const db = (tx as Tx | undefined) ?? this.prisma;
    const data = toPersistence(contract);
    try {
      await db.contract.upsert({
        where: { id: contract.id },
        create: { id: contract.id, ...data },
        update: data,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ContractAlreadyExists(contract.quoteId);
      }
      throw error;
    }
  }

  async list(query: PageQuery, f: ContractListFilter): Promise<Page<Contract>> {
    const { page, perPage, sort } = normalizePageQuery(query);
    const where: Prisma.ContractWhereInput = {};
    if (f.clientId) where.clientId = f.clientId;
    if (f.quoteId) where.quoteId = f.quoteId;
    if (f.signed !== undefined) where.signed = f.signed;
    if (f.dateFrom || f.dateTo) {
      where.createdAt = {
        ...(f.dateFrom ? { gte: f.dateFrom } : {}),
        ...(f.dateTo ? { lte: f.dateTo } : {}),
      };
    }
    const [field, dir] = (sort ?? 'createdAt:desc').split(':');
    const orderBy = {
      [SORTABLE.has(field) ? field : 'createdAt']: dir === 'asc' ? 'asc' : 'desc',
    } as Prisma.ContractOrderByWithRelationInput;
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.contract.count({ where }),
      this.prisma.contract.findMany({
        where,
        orderBy: [orderBy, { id: 'asc' }],
        skip: (page - 1) * perPage,
        take: perPage,
      }),
    ]);
    return new Page(rows.map(contractToDomain), total, { page, perPage });
  }
}
