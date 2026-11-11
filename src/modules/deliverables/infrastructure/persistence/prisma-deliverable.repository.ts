import { Injectable } from '@nestjs/common';
import { Deliverable as DeliverableRow, Prisma } from '@prisma/client';
import { generateUuid, normalizePageQuery, Page, PageQuery } from '@shared/kernel';
import { PrismaService } from '@shared/infrastructure/database/prisma.service';
import { Deliverable, DeliverableListFilter, DeliverableRepository } from '../../domain';

const SORTABLE = new Set(['uploadedAt', 'originalName']);

export const deliverableToDomain = (row: DeliverableRow): Deliverable =>
  Deliverable.rehydrate({
    id: row.id,
    missionId: row.missionId,
    consultantId: row.consultantId,
    clientId: row.clientId,
    file: {
      key: row.fileKey,
      originalName: row.originalName,
      mimeType: row.mimeType,
      size: row.size,
    },
    uploadedAt: row.uploadedAt,
    clientValidated: row.clientValidated,
    clientValidatedAt: row.clientValidatedAt,
    adminValidated: row.adminValidated,
    adminValidatedAt: row.adminValidatedAt,
    adminValidatedById: row.adminValidatedById,
  });

const toPersistence = (d: Deliverable) => ({
  missionId: d.missionId,
  consultantId: d.consultantId,
  clientId: d.clientId,
  fileKey: d.file.key,
  originalName: d.file.originalName,
  mimeType: d.file.mimeType,
  size: d.file.size,
  uploadedAt: d.uploadedAt,
  clientValidated: d.clientValidated,
  clientValidatedAt: d.clientValidatedAt,
  adminValidated: d.adminValidated,
  adminValidatedAt: d.adminValidatedAt,
  adminValidatedById: d.adminValidatedById,
});

@Injectable()
export class PrismaDeliverableRepository extends DeliverableRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  nextIdentity(): string {
    return generateUuid();
  }

  async findById(id: string): Promise<Deliverable | null> {
    const row = await this.prisma.deliverable.findUnique({ where: { id } });
    return row ? deliverableToDomain(row) : null;
  }

  async save(deliverable: Deliverable): Promise<void> {
    const data = toPersistence(deliverable);
    await this.prisma.deliverable.upsert({
      where: { id: deliverable.id },
      create: { id: deliverable.id, ...data },
      update: data,
    });
  }

  async list(query: PageQuery, f: DeliverableListFilter): Promise<Page<Deliverable>> {
    const { page, perPage, sort } = normalizePageQuery(query);
    const where: Prisma.DeliverableWhereInput = {};
    if (f.consultantId) where.consultantId = f.consultantId;
    if (f.clientId) where.clientId = f.clientId;
    if (f.missionId) where.missionId = f.missionId;
    if (f.clientValidated !== undefined) where.clientValidated = f.clientValidated;
    if (f.adminValidated !== undefined) where.adminValidated = f.adminValidated;
    if (f.uploadedFrom || f.uploadedTo) {
      where.uploadedAt = {
        ...(f.uploadedFrom ? { gte: f.uploadedFrom } : {}),
        ...(f.uploadedTo ? { lte: f.uploadedTo } : {}),
      };
    }
    const [field, dir] = (sort ?? 'uploadedAt:desc').split(':');
    const orderBy = {
      [SORTABLE.has(field) ? field : 'uploadedAt']: dir === 'asc' ? 'asc' : 'desc',
    } as Prisma.DeliverableOrderByWithRelationInput;
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.deliverable.count({ where }),
      this.prisma.deliverable.findMany({
        where,
        orderBy: [orderBy, { id: 'asc' }],
        skip: (page - 1) * perPage,
        take: perPage,
      }),
    ]);
    return new Page(rows.map(deliverableToDomain), total, { page, perPage });
  }
}
