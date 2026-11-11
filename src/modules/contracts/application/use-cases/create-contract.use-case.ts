import { Inject, Injectable } from '@nestjs/common';
import { Clock, CLOCK, fileExtension, NotFoundException } from '@shared/kernel';
import { UseCase } from '@shared/application/use-case';
import { requireAdminWith } from '@shared/application/actor';
import { FILE_STORAGE, FileStoragePort } from '@shared/application/ports/file-storage.port';
import { storeThenPersist, toStoredRef } from '@shared/application/files';
import {
  Contract,
  CONTRACT_REPOSITORY,
  ContractRepository,
  QUOTE_GATEWAY,
  QuoteGatewayPort,
} from '../../domain';
import { ContractView, CreateContractInput } from '../contracts.dto';
import { CONTRACT_PERMISSIONS } from '../services/contract-access';
import { ContractCommitter } from '../services/contract-committer';
import { toContractView } from '../services/contract-views';

/** Admin (`manage-quotes`) uploads the contract PDF for a VALIDÉ_ADMIN quote. */
@Injectable()
export class CreateContractUseCase implements UseCase<CreateContractInput, ContractView> {
  constructor(
    @Inject(CONTRACT_REPOSITORY) private readonly contracts: ContractRepository,
    @Inject(QUOTE_GATEWAY) private readonly quotes: QuoteGatewayPort,
    @Inject(FILE_STORAGE) private readonly storage: FileStoragePort,
    private readonly committer: ContractCommitter,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: CreateContractInput): Promise<ContractView> {
    const by = requireAdminWith(input.actor, CONTRACT_PERMISSIONS.MANAGE);
    const quote = await this.quotes.findQuote(input.quoteId);
    if (!quote) {
      throw new NotFoundException('QUOTE_NOT_FOUND', 'Quote not found', { id: input.quoteId });
    }
    const id = this.contracts.nextIdentity();
    const file = toStoredRef(
      `contracts/${id}/original${fileExtension(input.file.originalName)}`,
      input.file,
    );
    const contract = Contract.create(
      {
        id,
        quote,
        originalFile: file,
        createdById: by.userId,
        alreadyExists: await this.contracts.existsForQuote(quote.id),
      },
      this.clock.now(),
    );
    await storeThenPersist(this.storage, file, input.file.buffer, () =>
      this.contracts.save(contract),
    );
    await this.committer.afterCommit(contract);
    return toContractView(contract);
  }
}
