import { Page, PageQuery } from '@shared/kernel';
import { Mission } from '../entities/mission.entity';
import { MissionStatus } from '../value-objects/mission-status.vo';

export const MISSION_REPOSITORY = Symbol('MISSION_REPOSITORY');

export interface MissionListFilter {
  clientId?: string;
  /** missions the consultant is assigned to */
  consultantId?: string;
  status?: MissionStatus;
  /** case-insensitive "contains" */
  title?: string;
  contractId?: string;
  deliveryDateFrom?: Date;
  deliveryDateTo?: Date;
}

/** PORT. Persists the Mission aggregate with its consultants and tasks. */
export abstract class MissionRepository {
  abstract nextIdentity(): string;
  abstract findById(id: string): Promise<Mission | null>;
  abstract save(mission: Mission, tx?: unknown): Promise<void>;
  abstract list(query: PageQuery, filter: MissionListFilter): Promise<Page<Mission>>;
  /** ids of the missions the consultant is currently assigned to */
  abstract idsForConsultant(consultantId: string): Promise<string[]>;
}
