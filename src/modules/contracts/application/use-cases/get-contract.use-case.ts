import { Inject, Injectable } from '@nestjs/common';
import { UseCase } from '@shared/application/use-case';
import { CONTRACT_REPOSITORY, ContractRepository } from '../../domain';
import { ContractRef, ContractView } from '../contracts.dto';
import { loadVisibleContract } from '../services/contract-access';
import { toContractView } from '../services/contract-views';

@Injectable()
export class GetContractUseCase implements UseCase<ContractRef, ContractView> {
  constructor(@Inject(CONTRACT_REPOSITORY) private readonly contracts: ContractRepository) {}

  async execute(input: ContractRef): Promise<ContractView> {
    const { contract } = await loadVisibleContract(this.contracts, input.actor, input.contractId);
    return toContractView(contract);
  }
}
