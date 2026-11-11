import { Page, PageQuery } from '@shared/kernel';
import { Contract } from '../entities/contract.entity';

export const CONTRACT_REPOSITORY = Symbol('CONTRACT_REPOSITORY');

export interface ContractListFilter {
  clientId?: string;
  quoteId?: string;
  signed?: boolean;
  /** createdAt >= dateFrom */
  dateFrom?: Date;
  /** createdAt <= dateTo */
  dateTo?: Date;
}

/** PORT. `tx` is the opaque context handed out by `UnitOfWorkPort`. */
export abstract class ContractRepository {
  abstract nextIdentity(): string;
  abstract findById(id: string): Promise<Contract | null>;
  abstract existsForQuote(quoteId: string): Promise<boolean>;
  abstract save(contract: Contract, tx?: unknown): Promise<void>;
  abstract list(query: PageQuery, filter: ContractListFilter): Promise<Page<Contract>>;
}
