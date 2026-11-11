import { Inject, Injectable } from '@nestjs/common';
import { Clock, CLOCK, fileExtension } from '@shared/kernel';
import { UseCase } from '@shared/application/use-case';
import { resolveActor } from '@shared/application/actor';
import { FILE_STORAGE, FileStoragePort } from '@shared/application/ports/file-storage.port';
import { UNIT_OF_WORK, UnitOfWorkPort } from '@shared/application/ports/unit-of-work.port';
import { storeThenPersist, toStoredRef } from '@shared/application/files';
import {
  CONTRACT_REPOSITORY,
  contractNotFound,
  ContractRepository,
  QUOTE_GATEWAY,
  QuoteGatewayPort,
} from '../../domain';
import { ContractView, SignContractInput } from '../contracts.dto';
import { ContractCommitter } from '../services/contract-committer';
import { toContractView } from '../services/contract-views';

/**
 * The single signature path: the owning client uploads the signed PDF →
 * `Contract.signed` + quote `VALIDÉ_ADMIN → SIGNÉ_CLIENT`, in one transaction.
 */
@Injectable()
export class SignContractUseCase implements UseCase<SignContractInput, ContractView> {
  constructor(
    @Inject(CONTRACT_REPOSITORY) private readonly contracts: ContractRepository,
    @Inject(QUOTE_GATEWAY) private readonly quotes: QuoteGatewayPort,
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWorkPort,
    @Inject(FILE_STORAGE) private readonly storage: FileStoragePort,
    private readonly committer: ContractCommitter,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: SignContractInput): Promise<ContractView> {
    const by = resolveActor(input.actor, ['CLIENT']);
    const contract = await this.contracts.findById(input.contractId);
    if (!contract || !contract.isOwnedBy(by.userId)) throw contractNotFound(input.contractId);

    const now = this.clock.now();
    const file = toStoredRef(
      `contracts/${contract.id}/signed${fileExtension(input.file.originalName)}`,
      input.file,
    );
    contract.sign(by.userId, file, now);
    // checks the quote state machine before anything is written
    const quoteSignature = await this.quotes.prepareClientSignature(
      contract.quoteId,
      by.userId,
      now,
    );

    await storeThenPersist(this.storage, file, input.file.buffer, () =>
      this.uow.run(async (tx) => {
        await this.contracts.save(contract, tx);
        await quoteSignature.persist(tx);
      }),
    );
    await quoteSignature.finalize();
    await this.committer.afterCommit(contract);
    return toContractView(contract);
  }
}
