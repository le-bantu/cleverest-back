import { PageQuery } from '@shared/kernel';
import { ActorContext } from '@shared/application/use-case';
import { IncomingFile } from '@shared/application/files';

export interface MissionRef {
  actor: ActorContext;
  missionId: string;
}

export interface CreateMissionInput {
  actor: ActorContext;
  contractId: string;
  title: string;
  description?: string | null;
  deliveryDate?: Date | null;
  contractFile: IncomingFile;
}

export interface ListMissionsInput extends Partial<PageQuery> {
  actor: ActorContext;
  status?: string;
  title?: string;
  contractId?: string;
  deliveryDateFrom?: Date;
  deliveryDateTo?: Date;
}

export interface AssignMissionConsultantsInput extends MissionRef {
  consultants: Array<{ id: string; isLead?: boolean }>;
}

export interface RespondToAssignmentInput extends MissionRef {
  action: 'accept' | 'refuse';
}

export interface UpdateMissionProgressInput extends MissionRef {
  progress?: number | null;
  status?: string | null;
}

export interface AddMissionTaskInput extends MissionRef {
  title: string;
  description?: string | null;
  order?: number | null;
  assigneeConsultantId?: string | null;
}

export interface UpdateMissionTaskInput extends MissionRef {
  taskId: string;
  title?: string;
  description?: string | null;
  order?: number;
  status?: string;
  assigneeConsultantId?: string | null;
}

export interface MissionTaskRef extends MissionRef {
  taskId: string;
}

export interface ReorderMissionTasksInput extends MissionRef {
  orderedTaskIds: string[];
}

/** What the deliverables context may know about a mission. */
export interface MissionSummary {
  id: string;
  /** main quote the mission executes */
  quoteId: string;
  clientId: string;
  title: string;
  consultantIds: string[];
  status: string;
  /** EN_COURS or EN_VALIDATION */
  active: boolean;
}
