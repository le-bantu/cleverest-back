import { Injectable } from '@nestjs/common';
import { MissionReview as Row, Prisma } from '@prisma/client';
import { generateUuid, normalizePageQuery, Page, PageQuery } from '@shared/kernel';
import { PrismaService } from '@shared/infrastructure/database/prisma.service';
import { MissionStatus } from '@modules/missions/domain';
import { MissionReview, MissionReviewRepository } from '../../domain';
import {
  MissionReviewDetails,
  MissionReviewListFilter,
  MissionReviewQueriesPort,
} from '../../application/ports/mission-review-queries.port';

const SORTABLE = new Set(['createdAt', 'updatedAt', 'rating']);

export const missionReviewToDomain = (row: Row): MissionReview =>
  MissionReview.rehydrate({
    id: row.id,
    missionId: row.missionId,
    clientId: row.clientId,
    rating: row.rating,
    comment: row.comment,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });

@Injectable()
export class PrismaMissionReviewRepository extends MissionReviewRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  nextIdentity(): string {
    return generateUuid();
  }

  async findById(id: string): Promise<MissionReview | null> {
    const row = await this.prisma.missionReview.findUnique({ where: { id } });
    return row ? missionReviewToDomain(row) : null;
  }

  async findByMissionAndClient(missionId: string, clientId: string): Promise<MissionReview | null> {
    const row = await this.prisma.missionReview.findUnique({
      where: { missionId_clientId: { missionId, clientId } },
    });
    return row ? missionReviewToDomain(row) : null;
  }

  /** single `INSERT … ON CONFLICT (missionId, clientId) DO UPDATE` (Prisma native upsert) */
  async save(review: MissionReview): Promise<void> {
    const data = {
      rating: review.rating,
      comment: review.comment,
      updatedAt: review.updatedAt,
    };
    await this.prisma.missionReview.upsert({
      where: { missionId_clientId: { missionId: review.missionId, clientId: review.clientId } },
      create: {
        id: review.id,
        missionId: review.missionId,
        clientId: review.clientId,
        createdAt: review.createdAt,
        ...data,
      },
      update: data,
    });
  }
}

const DETAILS_INCLUDE = {
  mission: { select: { id: true, title: true, status: true } },
  client: { select: { id: true, email: true, clientProfile: { select: { name: true } } } },
} satisfies Prisma.MissionReviewInclude;

type DetailsRow = Prisma.MissionReviewGetPayload<{ include: typeof DETAILS_INCLUDE }>;

const toDetails = (row: DetailsRow): MissionReviewDetails => ({
  id: row.id,
  rating: row.rating,
  comment: row.comment,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  // Prisma enum keys are the ASCII keys of the domain enum (TERMINEE → 'TERMINÉE')
  mission: {
    id: row.mission.id,
    title: row.mission.title,
    status: MissionStatus[row.mission.status],
  },
  client: {
    id: row.client.id,
    name: row.client.clientProfile?.name ?? null,
    email: row.client.email,
  },
});

/** Admin read model: review + mission + client in one query. */
@Injectable()
export class PrismaMissionReviewQueries extends MissionReviewQueriesPort {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findById(id: string): Promise<MissionReviewDetails | null> {
    const row = await this.prisma.missionReview.findUnique({
      where: { id },
      include: DETAILS_INCLUDE,
    });
    return row ? toDetails(row) : null;
  }

  async list(query: PageQuery, f: MissionReviewListFilter): Promise<Page<MissionReviewDetails>> {
    const { page, perPage, sort } = normalizePageQuery(query);
    const where: Prisma.MissionReviewWhereInput = {};
    if (f.missionId) where.missionId = f.missionId;
    if (f.clientId) where.clientId = f.clientId;
    if (f.minRating !== undefined || f.maxRating !== undefined) {
      where.rating = {
        ...(f.minRating !== undefined ? { gte: f.minRating } : {}),
        ...(f.maxRating !== undefined ? { lte: f.maxRating } : {}),
      };
    }
    const [field, dir] = (sort ?? 'createdAt:desc').split(':');
    const orderBy = {
      [SORTABLE.has(field) ? field : 'createdAt']: dir === 'asc' ? 'asc' : 'desc',
    } as Prisma.MissionReviewOrderByWithRelationInput;
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.missionReview.count({ where }),
      this.prisma.missionReview.findMany({
        where,
        include: DETAILS_INCLUDE,
        orderBy: [orderBy, { id: 'asc' }],
        skip: (page - 1) * perPage,
        take: perPage,
      }),
    ]);
    return new Page(rows.map(toDetails), total, { page, perPage });
  }
}
