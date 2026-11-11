import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  ConflictException,
  generateUuid,
  normalizePageQuery,
  Page,
  PageQuery,
} from '@shared/kernel';
import { PrismaService } from '@shared/infrastructure/database/prisma.service';
import { Quote, QuoteListFilter, QuoteRepository } from '../../domain';
import { REQUEST_NUMBER_TAKEN } from '../../application/services/request-number-retry';
import { quoteInclude, quoteToDomain, quoteToPersistence, statusToPrisma } from './quote.mapper';

type Tx = Prisma.TransactionClient;

const SORTABLE = new Set(['createdAt', 'updatedAt', 'requestNumber', 'status']);

@Injectable()
export class PrismaQuoteRepository extends QuoteRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  private db(tx?: unknown): Tx {
    return (tx as Tx | undefined) ?? this.prisma;
  }

  nextIdentity(): string {
    return generateUuid();
  }

  async findById(id: string, tx?: unknown): Promise<Quote | null> {
    const row = await this.db(tx).quote.findUnique({ where: { id }, include: quoteInclude });
    return row ? quoteToDomain(row) : null;
  }

  async findSubquotes(parentQuoteId: string): Promise<Quote[]> {
    const rows = await this.prisma.quote.findMany({
      where: { parentQuoteId },
      include: quoteInclude,
      orderBy: { requestNumber: 'asc' },
    });
    return rows.map(quoteToDomain);
  }

  async hasSubquotes(parentQuoteId: string, tx?: unknown): Promise<boolean> {
    return (await this.db(tx).quote.count({ where: { parentQuoteId } })) > 0;
  }

  async save(quote: Quote, tx?: unknown): Promise<void> {
    if (tx) return this.write(quote, tx as Tx);
    await this.prisma.$transaction((inner) => this.write(quote, inner));
  }

  private async write(quote: Quote, tx: Tx): Promise<void> {
    const data = quoteToPersistence(quote);
    try {
      await tx.quote.upsert({
        where: { id: quote.id },
        create: { id: quote.id, ...data },
        update: data,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002' &&
        String(error.meta?.target ?? '').includes('requestNumber')
      ) {
        throw new ConflictException(REQUEST_NUMBER_TAKEN, 'Request number already used');
      }
      throw error;
    }
    // sync assignments: drop leads first so the partial unique index never trips mid-update
    const ids = quote.consultantIds;
    await tx.quoteConsultant.deleteMany({
      where: { quoteId: quote.id, consultantId: { notIn: ids } },
    });
    await tx.quoteConsultant.updateMany({
      where: { quoteId: quote.id },
      data: { isLead: false },
    });
    for (const c of quote.consultants) {
      await tx.quoteConsultant.upsert({
        where: { quoteId_consultantId: { quoteId: quote.id, consultantId: c.consultantId } },
        create: { quoteId: quote.id, consultantId: c.consultantId, isLead: c.isLead },
        update: { isLead: c.isLead },
      });
    }
  }

  async delete(id: string, tx?: unknown): Promise<void> {
    await this.db(tx).quote.deleteMany({ where: { id } });
  }

  async hasContract(quoteId: string): Promise<boolean> {
    const [client, consultant] = await Promise.all([
      this.prisma.contract.count({ where: { quoteId } }),
      this.prisma.consultantContract.count({
        where: { OR: [{ quoteId }, { rootQuoteId: quoteId }] },
      }),
    ]);
    return client + consultant > 0;
  }

  async lastRequestSequence(tx?: unknown): Promise<number> {
    const rows = await this.db(tx).$queryRaw<Array<{ max: number | null }>>`
      SELECT MAX(CAST(SUBSTRING("requestNumber" FROM 5) AS INTEGER)) AS max
      FROM "quotes" WHERE "requestNumber" ~ '^req-[0-9]+$'
    `;
    return Number(rows[0]?.max ?? 0);
  }

  async list(query: PageQuery, filter: QuoteListFilter): Promise<Page<Quote>> {
    const { page, perPage, sort } = normalizePageQuery(query);
    const where = this.buildWhere(filter);
    const [field, dir] = (sort ?? 'createdAt:desc').split(':');
    const orderBy = {
      [SORTABLE.has(field) ? field : 'createdAt']: dir === 'asc' ? 'asc' : 'desc',
    } as Prisma.QuoteOrderByWithRelationInput;
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.quote.count({ where }),
      this.prisma.quote.findMany({
        where,
        include: quoteInclude,
        orderBy: [orderBy, { id: 'asc' }],
        skip: (page - 1) * perPage,
        take: perPage,
      }),
    ]);
    return new Page(rows.map(quoteToDomain), total, { page, perPage });
  }

  private buildWhere(f: QuoteListFilter): Prisma.QuoteWhereInput {
    const where: Prisma.QuoteWhereInput = {};
    if (f.clientId) where.clientId = f.clientId;
    if (f.consultantId) where.consultants = { some: { consultantId: f.consultantId } };
    if (f.status) where.status = statusToPrisma(f.status);
    if (f.type) where.type = f.type;
    if (f.isSubquote !== undefined) where.isSubquote = f.isSubquote;
    if (f.parentQuoteId) where.parentQuoteId = f.parentQuoteId;
    if (f.hasContract !== undefined) {
      where.contract = f.hasContract ? { isNot: null } : { is: null };
    }
    if (f.isValidated !== undefined) {
      where.validatedAt = f.isValidated ? { not: null } : null;
    }
    if (f.dateMin || f.dateMax) {
      where.createdAt = {
        ...(f.dateMin ? { gte: f.dateMin } : {}),
        ...(f.dateMax ? { lte: f.dateMax } : {}),
      };
    }
    return where;
  }
}
