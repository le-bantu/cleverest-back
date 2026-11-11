import { Mission, MissionAssignment, MissionStatus, MissionTask, ProgressMode } from '../domain';

export interface TaskView {
  id: string;
  missionId: string;
  title: string;
  description: string | null;
  order: number;
  status: string;
  assigneeConsultantId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Client view: no consultant detail. */
export interface ClientMissionView {
  id: string;
  contractId: string;
  quoteId: string;
  title: string;
  description: string | null;
  status: MissionStatus;
  progress: number;
  deliveryDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Admin / consultant view. `isLead` is set for a consultant viewer. */
export interface MissionView extends ClientMissionView {
  clientId: string;
  progressMode: ProgressMode;
  consultants: MissionAssignment[];
  leadConsultantId: string | null;
  isLead?: boolean;
  contractFileName: string | null;
  taskCount: number;
  tasksDone: number;
}

export const toTaskView = (t: MissionTask): TaskView => ({
  id: t.id,
  missionId: t.missionId,
  title: t.title,
  description: t.description,
  order: t.order,
  status: t.status,
  assigneeConsultantId: t.assigneeConsultantId,
  createdAt: t.createdAt,
  updatedAt: t.updatedAt,
});

export const toClientMissionView = (m: Mission): ClientMissionView => ({
  id: m.id,
  contractId: m.contractId,
  quoteId: m.quoteId,
  title: m.title,
  description: m.description,
  status: m.status,
  progress: m.progress,
  deliveryDate: m.deliveryDate,
  createdAt: m.createdAt,
  updatedAt: m.updatedAt,
});

export const toMissionView = (m: Mission, consultantViewerId?: string): MissionView => ({
  ...toClientMissionView(m),
  clientId: m.clientId,
  progressMode: m.progressMode,
  consultants: m.consultants,
  leadConsultantId: m.leadConsultantId,
  ...(consultantViewerId ? { isLead: m.isLead(consultantViewerId) } : {}),
  contractFileName: m.contractFile?.originalName ?? null,
  taskCount: m.tasks.length,
  tasksDone: m.tasks.filter((t) => t.isDone).length,
});
