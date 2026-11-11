import { Injectable } from '@nestjs/common';
import { ContractsFacade } from '@modules/contracts/application/contracts.facade';
import { ConsultantEngagementPort } from '../../domain';

/** Deliverables → contracts, through the contracts public facade only. */
@Injectable()
export class ContractsEngagementAdapter extends ConsultantEngagementPort {
  constructor(private readonly contracts: ContractsFacade) {
    super();
  }

  isEngaged(consultantId: string, quoteId: string): Promise<boolean> {
    return this.contracts.hasSignedConsultantContract(consultantId, quoteId);
  }
}
