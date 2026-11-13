import { Inject, Injectable } from '@nestjs/common';
import {
  CONSULTANT_CONTRACT_REPOSITORY,
  ConsultantContractRepository,
  CONTRACT_REPOSITORY,
  ContractRepository,
} from '../domain';
import { ContractSummary } from './contracts.dto';

/** Public API of the contracts context (used by missions, deliverables). */
@Injectable()
export class ContractsFacade {
  constructor(
    @Inject(CONTRACT_REPOSITORY) private readonly contracts: ContractRepository,
    @Inject(CONSULTANT_CONTRACT_REPOSITORY)
    private readonly consultantContracts: ConsultantContractRepository,
  ) {}

  async findSummary(contractId: string): Promise<ContractSummary | null> {
    const c = await this.contracts.findById(contractId);
    return c ? { id: c.id, quoteId: c.quoteId, clientId: c.clientId, signed: c.signed } : null;
  }

  /** Has the consultant SIGNED their contract on this main quote (or one of its subquotes)? */
  hasSignedConsultantContract(consultantId: string, mainQuoteId: string): Promise<boolean> {
    return this.consultantContracts.hasSigned(consultantId, mainQuoteId);
  }

  /** What Cleverest committed to pay the consultant on this main quote (signed contracts); null if none. */
  signedConsultantAmount(consultantId: string, mainQuoteId: string): Promise<number | null> {
    return this.consultantContracts.signedAmount(consultantId, mainQuoteId);
  }
}
