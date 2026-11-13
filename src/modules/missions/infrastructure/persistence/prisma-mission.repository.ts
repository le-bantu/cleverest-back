import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { generateUuid, normalizePageQuery, Page, PageQuery } from '@shared/kernel';
import { PrismaService } from '@shared/infrastructure/database/prisma.service';
import { Mission, MissionListFilter, MissionRepository } from '../../domain';
import {
  missionInclude,
  missionStatusToPrisma,
  missionToDomain,
  missionToPersistence,
} from './mission.mapper';

type Tx = Prisma.TransactionClient;
const SORTABLE = new Set(['createdAt', 'updatedAt', 'deliveryDate', 'title', 'progress']);

@Injectable()
export class PrismaMissionRepository extends MissionRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  nextIdentity(): string {
    return generateUuid();
  }

  async findById(id: string): Promise<Mission | null> {
    const row = await this.prisma.mission.findUnique({ where: { id }, include: missionInclude });
    return row ? missionToDomain(row) : null;
  }

  async save(mission: Mission, tx?: unknown): Promise<void> {
    if (tx) return this.write(mission, tx as Tx);
    await this.prisma.$transaction((inner) => this.write(mission, inner));
  }

  /** Aggregate write: mission row, team (sync, one lead), tasks (sync). */
  private async write(mission: Mission, tx: Tx): Promise<void> {
    const data = missionToPersistence(mission);
    await tx.mission.upsert({
      where: { id: mission.id },
      create: { id: mission.id, ...data },
      update: data,
    });

    const consultantIds = mission.consultantIds;
    await tx.missionConsultant.deleteMany({
      where: { missionId: mission.id, consultantId: { notIn: consultantIds } },
    });
    // clear leads first so the partial unique index never trips mid-update
    await tx.missionConsultant.updateMany({
      where: { missionId: mission.id },
      data: { isLead: false },
    });
    for (const c of mission.consultants) {
      await tx.missionConsultant.upsert({
        where: {
          missionId_consultantId: { missionId: mission.id, consultantId: c.consultantId },
        },
        create: { missionId: mission.id, consultantId: c.consultantId, isLead: c.isLead },
        update: { isLead: c.isLead },
      });
    }

    const taskIds = mission.tasks.map((t) => t.id);
    await tx.missionTask.deleteMany({ where: { missionId: mission.id, id: { notIn: taskIds } } });
    for (const t of mission.tasks) {
      const row = {
        title: t.title,
        description: t.description,
        order: t.order,
        status: t.status,
        assigneeConsultantId: t.assigneeConsultantId,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      };
      await tx.missionTask.upsert({
        where: { id: t.id },
        create: { id: t.id, missionId: mission.id, ...row },
        update: row,
      });
    }
  }

  async idsForConsultant(consultantId: string): Promise<string[]> {
    const rows = await this.prisma.missionConsultant.findMany({
      where: { consultantId },
      select: { missionId: true },
    });
    return rows.map((r) => r.missionId);
  }

  async list(query: PageQuery, f: MissionListFilter): Promise<Page<Mission>> {
    const { page, perPage, sort } = normalizePageQuery(query);
    const where: Prisma.MissionWhereInput = {};
    if (f.clientId) where.clientId = f.clientId;
    if (f.consultantId) where.consultants = { some: { consultantId: f.consultantId } };
    if (f.status) where.status = missionStatusToPrisma(f.status);
    if (f.title) where.title = { contains: f.title, mode: 'insensitive' };
    if (f.contractId) where.contractId = f.contractId;
    if (f.deliveryDateFrom || f.deliveryDateTo) {
      where.deliveryDate = {
        ...(f.deliveryDateFrom ? { gte: f.deliveryDateFrom } : {}),
        ...(f.deliveryDateTo ? { lte: f.deliveryDateTo } : {}),
      };
    }
    const [field, dir] = (sort ?? 'createdAt:desc').split(':');
    const orderBy = {
      [SORTABLE.has(field) ? field : 'createdAt']: dir === 'asc' ? 'asc' : 'desc',
    } as Prisma.MissionOrderByWithRelationInput;
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.mission.count({ where }),
      this.prisma.mission.findMany({
        where,
        include: missionInclude,
        orderBy: [orderBy, { id: 'asc' }],
        skip: (page - 1) * perPage,
        take: perPage,
      }),
    ]);
    return new Page(rows.map(missionToDomain), total, { page, perPage });
  }
}
