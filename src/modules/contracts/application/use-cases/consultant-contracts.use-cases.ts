import { Inject, Injectable } from '@nestjs/common';
import {
  Clock,
  CLOCK,
  fileExtension,
  normalizePageQuery,
  NotFoundException,
  Page,
} from '@shared/kernel';
import { UseCase } from '@shared/application/use-case';
import { requireAdminWith, resolveActor } from '@shared/application/actor';
import { FILE_STORAGE, FileStoragePort } from '@shared/application/ports/file-storage.port';
import { download, DownloadedFile, storeThenPersist, toStoredRef } from '@shared/application/files';
import {
  CONSULTANT_CONTRACT_REPOSITORY,
  ConsultantContract,
  consultantContractNotFound,
  ConsultantContractRepository,
  QUOTE_GATEWAY,
  QuoteGatewayPort,
} from '../../domain';
import {
  ConsultantContractRef,
  ConsultantContractView,
  CreateConsultantContractInput,
  DownloadConsultantContractInput,
  ListConsultantContractsInput,
  SignConsultantContractInput,
} from '../contracts.dto';
import { CONTRACT_PERMISSIONS } from '../services/contract-access';
import {
  ConsultantContractCommitter,
  loadVisibleConsultantContract,
  toConsultantContractView,
} from '../services/consultant-contract-services';

const fileKey = (id: string, version: 'original' | 'signed', name: string) =>
  `consultant-contracts/${id}/${version}${fileExtension(name)}`;

/** Admin (`manage-quotes`) uploads the PDF binding a consultant to the quote they priced. */
@Injectable()
export class CreateConsultantContractUseCase implements UseCase<
  CreateConsultantContractInput,
  ConsultantContractView
> {
  constructor(
    @Inject(CONSULTANT_CONTRACT_REPOSITORY)
    private readonly contracts: ConsultantContractRepository,
    @Inject(QUOTE_GATEWAY) private readonly quotes: QuoteGatewayPort,
    @Inject(FILE_STORAGE) private readonly storage: FileStoragePort,
    private readonly committer: ConsultantContractCommitter,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: CreateConsultantContractInput): Promise<ConsultantContractView> {
    const by = requireAdminWith(input.actor, CONTRACT_PERMISSIONS.MANAGE);
    const quote = await this.quotes.findQuote(input.quoteId);
    if (!quote) {
      throw new NotFoundException('QUOTE_NOT_FOUND', 'Quote not found', { id: input.quoteId });
    }
    const id = this.contracts.nextIdentity();
    const file = toStoredRef(fileKey(id, 'original', input.file.originalName), input.file);
    const contract = ConsultantContract.create(
      {
        id,
        quote,
        consultantId: input.consultantId,
        amount: input.amount,
        originalFile: file,
        createdById: by.userId,
        alreadyExists: await this.contracts.existsFor(quote.id, input.consultantId),
      },
      this.clock.now(),
    );
    await storeThenPersist(this.storage, file, input.file.buffer, () =>
      this.contracts.save(contract),
    );
    await this.committer.afterCommit(contract);
    return toConsultantContractView(contract);
  }
}

/** The bound consultant uploads the signed PDF. */
@Injectable()
export class SignConsultantContractUseCase implements UseCase<
  SignConsultantContractInput,
  ConsultantContractView
> {
  constructor(
    @Inject(CONSULTANT_CONTRACT_REPOSITORY)
    private readonly contracts: ConsultantContractRepository,
    @Inject(FILE_STORAGE) private readonly storage: FileStoragePort,
    private readonly committer: ConsultantContractCommitter,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: SignConsultantContractInput): Promise<ConsultantContractView> {
    const by = resolveActor(input.actor, ['CONSULTANT']);
    const contract = await this.contracts.findById(input.contractId);
    if (!contract || !contract.belongsTo(by.userId)) {
      throw consultantContractNotFound(input.contractId);
    }
    const file = toStoredRef(fileKey(contract.id, 'signed', input.file.originalName), input.file);
    contract.sign(by.userId, file, this.clock.now());
    await storeThenPersist(this.storage, file, input.file.buffer, () =>
      this.contracts.save(contract),
    );
    await this.committer.afterCommit(contract);
    return toConsultantContractView(contract);
  }
}

/** Admins see every consultant contract; a consultant only theirs. */
@Injectable()
export class ListConsultantContractsUseCase implements UseCase<
  ListConsultantContractsInput,
  Page<ConsultantContractView>
> {
  constructor(
    @Inject(CONSULTANT_CONTRACT_REPOSITORY)
    private readonly contracts: ConsultantContractRepository,
  ) {}

  async execute(input: ListConsultantContractsInput): Promise<Page<ConsultantContractView>> {
    const by = resolveActor(input.actor, ['ADMIN', 'CONSULTANT']);
    const page = await this.contracts.list(normalizePageQuery(input), {
      consultantId: by.kind === 'CONSULTANT' ? by.userId : input.consultantId,
      quoteId: input.quoteId,
      rootQuoteId: input.rootQuoteId,
      signed: input.signed,
    });
    return page.map(toConsultantContractView);
  }
}

@Injectable()
export class GetConsultantContractUseCase implements UseCase<
  ConsultantContractRef,
  ConsultantContractView
> {
  constructor(
    @Inject(CONSULTANT_CONTRACT_REPOSITORY)
    private readonly contracts: ConsultantContractRepository,
  ) {}

  async execute(input: ConsultantContractRef): Promise<ConsultantContractView> {
    const { contract } = await loadVisibleConsultantContract(
      this.contracts,
      input.actor,
      input.contractId,
    );
    return toConsultantContractView(contract);
  }
}

/** Original or signed PDF, for the bound consultant or an admin. */
@Injectable()
export class DownloadConsultantContractUseCase implements UseCase<
  DownloadConsultantContractInput,
  DownloadedFile
> {
  constructor(
    @Inject(CONSULTANT_CONTRACT_REPOSITORY)
    private readonly contracts: ConsultantContractRepository,
    @Inject(FILE_STORAGE) private readonly storage: FileStoragePort,
  ) {}

  async execute(input: DownloadConsultantContractInput): Promise<DownloadedFile> {
    const { contract } = await loadVisibleConsultantContract(
      this.contracts,
      input.actor,
      input.contractId,
    );
    const file = input.version === 'signed' ? contract.signedFile : contract.originalFile;
    if (!file) {
      throw new NotFoundException('SIGNED_CONTRACT_NOT_FOUND', 'The contract is not signed yet', {
        id: contract.id,
      });
    }
    return download(this.storage, file);
  }
}

/** Admin (`manage-quotes`) withdraws an UNSIGNED consultant contract (409 once signed). */
@Injectable()
export class DeleteConsultantContractUseCase implements UseCase<ConsultantContractRef, void> {
  constructor(
    @Inject(CONSULTANT_CONTRACT_REPOSITORY)
    private readonly contracts: ConsultantContractRepository,
    @Inject(FILE_STORAGE) private readonly storage: FileStoragePort,
    private readonly committer: ConsultantContractCommitter,
  ) {}

  async execute(input: ConsultantContractRef): Promise<void> {
    const by = requireAdminWith(input.actor, CONTRACT_PERMISSIONS.MANAGE);
    const contract = await this.contracts.findById(input.contractId);
    if (!contract) throw consultantContractNotFound(input.contractId);
    contract.assertDeletable();
    await this.contracts.delete(contract.id);
    await this.storage.delete(contract.originalFile.key).catch(() => undefined);
    await this.committer.afterDelete(contract, by.userId);
  }
}
