import { Page, PageQuery } from '@shared/kernel';
import { Deliverable } from '../entities/deliverable.entity';

export const DELIVERABLE_REPOSITORY = Symbol('DELIVERABLE_REPOSITORY');

export interface DeliverableListFilter {
  consultantId?: string;
  clientId?: string;
  missionId?: string;
  clientValidated?: boolean;
  adminValidated?: boolean;
  uploadedFrom?: Date;
  uploadedTo?: Date;
}

export abstract class DeliverableRepository {
  abstract nextIdentity(): string;
  abstract findById(id: string): Promise<Deliverable | null>;
  abstract save(deliverable: Deliverable): Promise<void>;
  abstract list(query: PageQuery, filter: DeliverableListFilter): Promise<Page<Deliverable>>;
}
