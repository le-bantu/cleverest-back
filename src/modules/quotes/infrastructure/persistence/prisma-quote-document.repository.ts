import { Injectable } from '@nestjs/common';
import { Prisma, QuoteDocument as DocRow, QuoteDocumentVisibility } from '@prisma/client';
import { generateUuid } from '@shared/kernel';
import { PrismaService } from '@shared/infrastructure/database/prisma.service';
import {
  DocumentVisibility,
  QuoteActor,
  QuoteDocument,
  QuoteDocumentRepository,
} from '../../domain';

const include = { visibleUsers: true } satisfies Prisma.QuoteDocumentInclude;

const toDomain = (row: DocRow & { visibleUsers: QuoteDocumentVisibility[] }): QuoteDocument =>
  QuoteDocument.rehydrate({
    id: row.id,
    quoteId: row.quoteId,
    uploadedById: row.uploadedById,
    uploadedByRole: row.uploadedByRole as QuoteActor,
    label: row.label,
    path: row.path,
    originalName: row.originalName,
    mimeType: row.mimeType,
    size: row.size,
    comment: row.comment,
    visibility: DocumentVisibility.create(
      row.visibleTo,
      row.visibleUsers.map((v) => v.userId),
    ),
    createdAt: row.createdAt,
  });

@Injectable()
export class PrismaQuoteDocumentRepository extends QuoteDocumentRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  nextIdentity(): string {
    return generateUuid();
  }

  async findById(id: string): Promise<QuoteDocument | null> {
    const row = await this.prisma.quoteDocument.findUnique({ where: { id }, include });
    return row ? toDomain(row) : null;
  }

  async listByQuote(quoteId: string): Promise<QuoteDocument[]> {
    const rows = await this.prisma.quoteDocument.findMany({
      where: { quoteId },
      include,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toDomain);
  }

  async save(d: QuoteDocument): Promise<void> {
    const data = {
      quoteId: d.quoteId,
      uploadedById: d.uploadedById,
      uploadedByRole: d.uploadedByRole,
      label: d.label,
      path: d.path,
      originalName: d.originalName,
      mimeType: d.mimeType,
      size: d.size,
      comment: d.comment,
      visibleTo: d.visibility.visibleTo,
      createdAt: d.createdAt,
    };
    await this.prisma.$transaction(async (tx) => {
      await tx.quoteDocument.upsert({
        where: { id: d.id },
        create: { id: d.id, ...data },
        update: data,
      });
      await tx.quoteDocumentVisibility.deleteMany({ where: { documentId: d.id } });
      if (d.visibility.userIds.length) {
        await tx.quoteDocumentVisibility.createMany({
          data: d.visibility.userIds.map((userId) => ({ documentId: d.id, userId })),
        });
      }
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.quoteDocument.deleteMany({ where: { id } });
  }
}
