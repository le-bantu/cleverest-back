import { Injectable } from '@nestjs/common';
import { ClientInvoice as Row, Prisma } from '@prisma/client';
import { generateUuid, normalizePageQuery, Page, PageQuery } from '@shared/kernel';
import { PrismaService } from '@shared/infrastructure/database/prisma.service';
import {
  ClientInvoice,
  ClientInvoiceAlreadyExists,
  ClientInvoiceListFilter,
  ClientInvoiceRepository,
  InvoiceNumber,
  InvoiceNumberTaken,
} from '../../domain';

const SORTABLE = new Set(['generatedAt', 'sentAt', 'amount', 'invoiceNumber']);

export const clientInvoiceToDomain = (row: Row): ClientInvoice =>
  ClientInvoice.rehydrate({
    id: row.id,
    paymentId: row.paymentId,
    missionId: row.missionId,
    clientId: row.clientId,
    invoiceNumber: InvoiceNumber.of(row.invoiceNumber),
    amount: row.amount.toNumber(),
    pdfFile: {
      key: row.pdfFileKey,
      originalName: row.pdfFileName,
      mimeType: 'application/pdf',
      size: row.pdfSize,
    },
    generatedAt: row.generatedAt,
    generatedById: row.generatedById,
    sentAt: row.sentAt,
  });

const toPersistence = (i: ClientInvoice) => ({
  paymentId: i.paymentId,
  missionId: i.missionId,
  clientId: i.clientId,
  invoiceNumber: i.invoiceNumber.value,
  amount: new Prisma.Decimal(i.amount),
  pdfFileKey: i.pdfFile.key,
  pdfFileName: i.pdfFile.originalName,
  pdfSize: i.pdfFile.size,
  generatedAt: i.generatedAt,
  generatedById: i.generatedById,
  sentAt: i.sentAt,
});

@Injectable()
export class PrismaClientInvoiceRepository extends ClientInvoiceRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  nextIdentity(): string {
    return generateUuid();
  }

  async findById(id: string): Promise<ClientInvoice | null> {
    const row = await this.prisma.clientInvoice.findUnique({ where: { id } });
    return row ? clientInvoiceToDomain(row) : null;
  }

  async existsForPayment(paymentId: string): Promise<boolean> {
    return (await this.prisma.clientInvoice.count({ where: { paymentId } })) > 0;
  }

  async lastSequence(year: number): Promise<number> {
    const prefix = InvoiceNumber.prefixFor(year);
    const rows = await this.prisma.$queryRaw<Array<{ max: number | null }>>`
      SELECT MAX(CAST(SUBSTRING("invoiceNumber" FROM ${prefix.length + 1}::int) AS INTEGER)) AS max
      FROM client_invoices WHERE "invoiceNumber" LIKE ${`${prefix}%`}`;
    return Number(rows[0]?.max ?? 0);
  }

  async save(invoice: ClientInvoice): Promise<void> {
    const data = toPersistence(invoice);
    try {
      await this.prisma.clientInvoice.upsert({
        where: { id: invoice.id },
        create: { id: invoice.id, ...data },
        update: data,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const target = String((error.meta?.target as string[] | string | undefined) ?? '');
        if (target.includes('paymentId')) throw new ClientInvoiceAlreadyExists(invoice.paymentId);
        throw new InvoiceNumberTaken(invoice.invoiceNumber.value);
      }
      throw error;
    }
  }

  async list(query: PageQuery, f: ClientInvoiceListFilter): Promise<Page<ClientInvoice>> {
    const { page, perPage, sort } = normalizePageQuery(query);
    const where: Prisma.ClientInvoiceWhereInput = {};
    if (f.clientId) where.clientId = f.clientId;
    if (f.missionId) where.missionId = f.missionId;
    if (f.sent !== undefined) where.sentAt = f.sent ? { not: null } : null;
    const [field, dir] = (sort ?? 'generatedAt:desc').split(':');
    const orderBy = {
      [SORTABLE.has(field) ? field : 'generatedAt']: dir === 'asc' ? 'asc' : 'desc',
    } as Prisma.ClientInvoiceOrderByWithRelationInput;
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.clientInvoice.count({ where }),
      this.prisma.clientInvoice.findMany({
        where,
        orderBy: [orderBy, { id: 'asc' }],
        skip: (page - 1) * perPage,
        take: perPage,
      }),
    ]);
    return new Page(rows.map(clientInvoiceToDomain), total, { page, perPage });
  }
}
