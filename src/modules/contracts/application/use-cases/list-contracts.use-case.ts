import { Inject, Injectable } from '@nestjs/common';
import { normalizePageQuery, Page } from '@shared/kernel';
import { UseCase } from '@shared/application/use-case';
import { resolveActor } from '@shared/application/actor';
import { CONTRACT_REPOSITORY, ContractRepository } from '../../domain';
import { ContractView, ListContractsInput } from '../contracts.dto';
import { toContractView } from '../services/contract-views';

/** Admins see every contract; a client only theirs. */
@Injectable()
export class ListContractsUseCase implements UseCase<ListContractsInput, Page<ContractView>> {
  constructor(@Inject(CONTRACT_REPOSITORY) private readonly contracts: ContractRepository) {}

  async execute(input: ListContractsInput): Promise<Page<ContractView>> {
    const by = resolveActor(input.actor, ['ADMIN', 'CLIENT']);
    const page = await this.contracts.list(normalizePageQuery(input), {
      clientId: by.kind === 'CLIENT' ? by.userId : undefined,
      quoteId: input.quoteId,
      signed: input.signed,
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
    });
    return page.map(toContractView);
  }
}
