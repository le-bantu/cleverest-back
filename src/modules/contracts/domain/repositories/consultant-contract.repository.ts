import { Page, PageQuery } from '@shared/kernel';
import { ConsultantContract } from '../entities/consultant-contract.entity';

export const CONSULTANT_CONTRACT_REPOSITORY = Symbol('CONSULTANT_CONTRACT_REPOSITORY');

export interface ConsultantContractListFilter {
  consultantId?: string;
  quoteId?: string;
  /** main quote (matches the contracts of all its subquotes) */
  rootQuoteId?: string;
  signed?: boolean;
}

/** PORT. */
export abstract class ConsultantContractRepository {
  abstract nextIdentity(): string;
  abstract findById(id: string): Promise<ConsultantContract | null>;
  abstract existsFor(quoteId: string, consultantId: string): Promise<boolean>;
  /** a SIGNED contract of this consultant on the main quote or one of its subquotes */
  abstract hasSigned(consultantId: string, rootQuoteId: string): Promise<boolean>;
  /** sum of the SIGNED contract amounts of this consultant on the main quote; null when none */
  abstract signedAmount(consultantId: string, rootQuoteId: string): Promise<number | null>;
  abstract save(contract: ConsultantContract): Promise<void>;
  abstract delete(id: string): Promise<void>;
  abstract list(
    query: PageQuery,
    filter: ConsultantContractListFilter,
  ): Promise<Page<ConsultantContract>>;
}
