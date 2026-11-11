import {
  Mission as MissionRow,
  MissionConsultant as MissionConsultantRow,
  MissionStatus as PrismaMissionStatus,
  MissionTask as MissionTaskRow,
  Prisma,
} from '@prisma/client';
import { Mission, MissionStatus, MissionTask, MissionTaskStatus } from '../../domain';

export const missionInclude = {
  consultants: { orderBy: { assignedAt: 'asc' } },
  tasks: { orderBy: { order: 'asc' } },
} satisfies Prisma.MissionInclude;

type MissionWithRelations = MissionRow & {
  consultants: MissionConsultantRow[];
  tasks: MissionTaskRow[];
};

// Prisma enum keys are ASCII; the domain keeps the accented DB values.
const TO_PRISMA: Record<MissionStatus, PrismaMissionStatus> = {
  [MissionStatus.EN_ATTENTE]: 'EN_ATTENTE',
  [MissionStatus.EN_COURS]: 'EN_COURS',
  [MissionStatus.EN_VALIDATION]: 'EN_VALIDATION',
  [MissionStatus.TERMINEE]: 'TERMINEE',
  [MissionStatus.REJETEE]: 'REJETEE',
};
const TO_DOMAIN = Object.fromEntries(
  Object.entries(TO_PRISMA).map(([domain, prisma]) => [prisma, domain]),
) as Record<PrismaMissionStatus, MissionStatus>;

export const missionStatusToPrisma = (s: MissionStatus): PrismaMissionStatus => TO_PRISMA[s];

export const missionToDomain = (row: MissionWithRelations): Mission =>
  Mission.rehydrate({
    id: row.id,
    contractId: row.contractId,
    quoteId: row.quoteId,
    clientId: row.clientId,
    title: row.title,
    description: row.description,
    status: TO_DOMAIN[row.status],
    progress: row.progress,
    deliveryDate: row.deliveryDate,
    contractFile: row.contractFileKey
      ? {
          key: row.contractFileKey,
          originalName: row.contractFileName ?? 'contrat-mission',
          mimeType: row.contractMimeType,
          size: row.contractSize ?? 0,
        }
      : null,
    consultants: row.consultants.map((c) => ({ consultantId: c.consultantId, isLead: c.isLead })),
    tasks: row.tasks.map((t) =>
      MissionTask.rehydrate({
        id: t.id,
        missionId: t.missionId,
        title: t.title,
        description: t.description,
        order: t.order,
        status: t.status as MissionTaskStatus,
        assigneeConsultantId: t.assigneeConsultantId,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      }),
    ),
    createdById: row.createdById,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });

export const missionToPersistence = (m: Mission) => ({
  contractId: m.contractId,
  quoteId: m.quoteId,
  clientId: m.clientId,
  title: m.title,
  description: m.description,
  status: missionStatusToPrisma(m.status),
  progress: m.progress,
  deliveryDate: m.deliveryDate,
  contractFileKey: m.contractFile?.key ?? null,
  contractFileName: m.contractFile?.originalName ?? null,
  contractMimeType: m.contractFile?.mimeType ?? null,
  contractSize: m.contractFile?.size ?? null,
  createdById: m.createdById,
  createdAt: m.createdAt,
  updatedAt: m.updatedAt,
});
