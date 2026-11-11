import { Injectable } from '@nestjs/common';
import { ContractsFacade } from '@modules/contracts/application/contracts.facade';
import { ContractForMission, ContractGatewayPort } from '../../domain';

/** Missions → contracts, through the contracts public facade only. */
@Injectable()
export class ContractsGatewayAdapter extends ContractGatewayPort {
  constructor(private readonly contracts: ContractsFacade) {
    super();
  }

  findContract(contractId: string): Promise<ContractForMission | null> {
    return this.contracts.findSummary(contractId);
  }
}
