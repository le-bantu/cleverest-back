import { Inject, Injectable } from '@nestjs/common';
import { NotFoundException } from '@shared/kernel';
import { UseCase } from '@shared/application/use-case';
import { FILE_STORAGE, FileStoragePort } from '@shared/application/ports/file-storage.port';
import { download, DownloadedFile } from '@shared/application/files';
import { CONTRACT_REPOSITORY, ContractRepository } from '../../domain';
import { DownloadContractInput } from '../contracts.dto';
import { loadVisibleContract } from '../services/contract-access';

/** Original or signed PDF, for the owning client or an admin. */
@Injectable()
export class DownloadContractUseCase implements UseCase<DownloadContractInput, DownloadedFile> {
  constructor(
    @Inject(CONTRACT_REPOSITORY) private readonly contracts: ContractRepository,
    @Inject(FILE_STORAGE) private readonly storage: FileStoragePort,
  ) {}

  async execute(input: DownloadContractInput): Promise<DownloadedFile> {
    const { contract } = await loadVisibleContract(this.contracts, input.actor, input.contractId);
    const file = input.version === 'signed' ? contract.signedFile : contract.originalFile;
    if (!file) {
      throw new NotFoundException('SIGNED_CONTRACT_NOT_FOUND', 'The contract is not signed yet', {
        id: contract.id,
      });
    }
    return download(this.storage, file);
  }
}
