import { Inject, Injectable } from '@nestjs/common';
import { CONTRACT_REPOSITORY, ContractRepository } from '../domain';
import { ContractSummary } from './contracts.dto';

/** Public API of the contracts context (used by missions). */
@Injectable()
export class ContractsFacade {
  constructor(@Inject(CONTRACT_REPOSITORY) private readonly contracts: ContractRepository) {}

  async findSummary(contractId: string): Promise<ContractSummary | null> {
    const c = await this.contracts.findById(contractId);
    return c ? { id: c.id, quoteId: c.quoteId, clientId: c.clientId, signed: c.signed } : null;
  }
}
