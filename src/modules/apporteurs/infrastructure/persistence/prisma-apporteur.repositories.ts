import { Injectable } from '@nestjs/common';
import {
  Commission as CommissionRow,
  CommissionStatus as DbCommissionStatus,
  Prisma,
  Prospect as ProspectRow,
  ProspectStatus as DbProspectStatus,
} from '@prisma/client';
import { generateUuid, normalizePageQuery, Page, PageQuery } from '@shared/kernel';
import { PrismaService } from '@shared/infrastructure/database/prisma.service';
import {
  Commission,
  CommissionListFilter,
  CommissionRepository,
  CommissionStatus,
  Prospect,
  ProspectListFilter,
  ProspectRepository,
  ProspectStatus,
} from '../../domain';

type Tx = Prisma.TransactionClient;

const PROSPECT_TO_DB: Record<ProspectStatus, DbProspectStatus> = {
  [ProspectStatus.EN_ATTENTE]: DbProspectStatus.EN_ATTENTE,
  [ProspectStatus.CONVERTI]: DbProspectStatus.CONVERTI,
  [ProspectStatus.REJETE]: DbProspectStatus.REJETE,
};
const PROSPECT_FROM_DB: Record<DbProspectStatus, ProspectStatus> = {
  EN_ATTENTE: ProspectStatus.EN_ATTENTE,
  CONVERTI: ProspectStatus.CONVERTI,
  REJETE: ProspectStatus.REJETE,
};
const COMMISSION_TO_DB: Record<CommissionStatus, DbCommissionStatus> = {
  [CommissionStatus.EN_ATTENTE]: DbCommissionStatus.EN_ATTENTE,
  [CommissionStatus.VALIDEE]: DbCommissionStatus.VALIDEE,
  [CommissionStatus.PAYEE]: DbCommissionStatus.PAYEE,
};
const COMMISSION_FROM_DB: Record<DbCommissionStatus, CommissionStatus> = {
  EN_ATTENTE: CommissionStatus.EN_ATTENTE,
  VALIDEE: CommissionStatus.VALIDEE,
  PAYEE: CommissionStatus.PAYEE,
};

const page = async <Row, T>(
  query: PageQuery,
  sortable: Set<string>,
  count: () => Promise<number>,
  find: (args: { orderBy: object[]; skip: number; take: number }) => Promise<Row[]>,
  map: (row: Row) => T,
): Promise<Page<T>> => {
  const { page: n, perPage, sort } = normalizePageQuery(query);
  const [field, dir] = (sort ?? 'createdAt:desc').split(':');
  const orderBy = [
    { [sortable.has(field) ? field : 'createdAt']: dir === 'asc' ? 'asc' : 'desc' },
    { id: 'asc' },
  ];
  const [total, rows] = await Promise.all([
    count(),
    find({ orderBy, skip: (n - 1) * perPage, take: perPage }),
  ]);
  return new Page(rows.map(map), total, { page: n, perPage });
};

export const prospectToDomain = (row: ProspectRow): Prospect =>
  Prospect.rehydrate({
    id: row.id,
    apporteurId: row.apporteurId,
    name: row.name,
    company: row.company,
    contactEmail: row.contactEmail,
    contactPhone: row.contactPhone,
    document: row.documentKey
      ? {
          key: row.documentKey,
          originalName: row.documentName ?? 'document',
          mimeType: row.documentMimeType,
          size: row.documentSize ?? 0,
        }
      : null,
    status: PROSPECT_FROM_DB[row.status],
    rejectedReason: row.rejectedReason,
    clientId: row.clientId,
    missionId: row.missionId,
    processedAt: row.processedAt,
    processedById: row.processedById,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });

@Injectable()
export class PrismaProspectRepository extends ProspectRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  nextIdentity(): string {
    return generateUuid();
  }

  async findById(id: string): Promise<Prospect | null> {
    const row = await this.prisma.prospect.findUnique({ where: { id } });
    return row ? prospectToDomain(row) : null;
  }

  async save(p: Prospect, tx?: unknown): Promise<void> {
    const db = (tx as Tx | undefined) ?? this.prisma;
    const data = {
      apporteurId: p.apporteurId,
      name: p.name,
      company: p.company,
      contactEmail: p.contactEmail,
      contactPhone: p.contactPhone,
      documentKey: p.document?.key ?? null,
      documentName: p.document?.originalName ?? null,
      documentMimeType: p.document?.mimeType ?? null,
      documentSize: p.document?.size ?? null,
      status: PROSPECT_TO_DB[p.status],
      rejectedReason: p.rejectedReason,
      clientId: p.clientId,
      missionId: p.missionId,
      processedAt: p.processedAt,
      processedById: p.processedById,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    };
    await db.prospect.upsert({ where: { id: p.id }, create: { id: p.id, ...data }, update: data });
  }

  list(query: PageQuery, f: ProspectListFilter): Promise<Page<Prospect>> {
    const where: Prisma.ProspectWhereInput = {
      ...(f.apporteurId ? { apporteurId: f.apporteurId } : {}),
      ...(f.status ? { status: PROSPECT_TO_DB[f.status] } : {}),
    };
    return page(
      query,
      new Set(['createdAt', 'updatedAt', 'name', 'processedAt']),
      () => this.prisma.prospect.count({ where }),
      (args) => this.prisma.prospect.findMany({ where, ...args }),
      prospectToDomain,
    );
  }
}

export const commissionToDomain = (row: CommissionRow): Commission =>
  Commission.rehydrate({
    id: row.id,
    apporteurId: row.apporteurId,
    prospectId: row.prospectId,
    clientId: row.clientId,
    missionId: row.missionId,
    clientName: row.clientName,
    missionTitle: row.missionTitle,
    amount: row.amount?.toNumber() ?? null,
    status: COMMISSION_FROM_DB[row.status],
    validatedAt: row.validatedAt,
    paidAt: row.paidAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });

@Injectable()
export class PrismaCommissionRepository extends CommissionRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  nextIdentity(): string {
    return generateUuid();
  }

  async findById(id: string): Promise<Commission | null> {
    const row = await this.prisma.commission.findUnique({ where: { id } });
    return row ? commissionToDomain(row) : null;
  }

  async save(c: Commission, tx?: unknown): Promise<void> {
    const db = (tx as Tx | undefined) ?? this.prisma;
    const data = {
      apporteurId: c.apporteurId,
      prospectId: c.prospectId,
      clientId: c.clientId,
      missionId: c.missionId,
      clientName: c.clientName,
      missionTitle: c.missionTitle,
      amount: c.amount === null ? null : new Prisma.Decimal(c.amount),
      status: COMMISSION_TO_DB[c.status],
      validatedAt: c.validatedAt,
      paidAt: c.paidAt,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    };
    await db.commission.upsert({
      where: { id: c.id },
      create: { id: c.id, ...data },
      update: data,
    });
  }

  list(query: PageQuery, f: CommissionListFilter): Promise<Page<Commission>> {
    const where: Prisma.CommissionWhereInput = {
      ...(f.apporteurId ? { apporteurId: f.apporteurId } : {}),
      ...(f.status ? { status: COMMISSION_TO_DB[f.status] } : {}),
      ...(f.missionId ? { missionId: f.missionId } : {}),
    };
    return page(
      query,
      new Set(['createdAt', 'updatedAt', 'amount', 'paidAt']),
      () => this.prisma.commission.count({ where }),
      (args) => this.prisma.commission.findMany({ where, ...args }),
      commissionToDomain,
    );
  }
}
