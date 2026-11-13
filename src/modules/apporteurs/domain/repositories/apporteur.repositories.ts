import { Page, PageQuery } from '@shared/kernel';
import { Prospect } from '../entities/prospect.entity';
import { Commission } from '../entities/commission.entity';
import { CommissionStatus, ProspectStatus } from '../value-objects/statuses';

export const PROSPECT_REPOSITORY = Symbol('PROSPECT_REPOSITORY');
export const COMMISSION_REPOSITORY = Symbol('COMMISSION_REPOSITORY');

export interface ProspectListFilter {
  apporteurId?: string;
  status?: ProspectStatus;
}

/** PORT. `tx` is the opaque context handed out by `UnitOfWorkPort`. */
export abstract class ProspectRepository {
  abstract nextIdentity(): string;
  abstract findById(id: string): Promise<Prospect | null>;
  abstract save(prospect: Prospect, tx?: unknown): Promise<void>;
  abstract list(query: PageQuery, filter: ProspectListFilter): Promise<Page<Prospect>>;
}

export interface CommissionListFilter {
  apporteurId?: string;
  status?: CommissionStatus;
  missionId?: string;
}

/** PORT. */
export abstract class CommissionRepository {
  abstract nextIdentity(): string;
  abstract findById(id: string): Promise<Commission | null>;
  abstract save(commission: Commission, tx?: unknown): Promise<void>;
  abstract list(query: PageQuery, filter: CommissionListFilter): Promise<Page<Commission>>;
}
