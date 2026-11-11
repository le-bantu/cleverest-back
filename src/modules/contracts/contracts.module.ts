import { Module } from '@nestjs/common';
import { BestEffortNotifier } from '@shared/application/services/best-effort-notifier';
import { QuotesModule } from '@modules/quotes/quotes.module';
import { contractsInfrastructureProviders } from './infrastructure/contracts.providers';
import { ContractCommitter } from './application/services/contract-committer';
import { ContractsFacade } from './application/contracts.facade';
import { CreateContractUseCase } from './application/use-cases/create-contract.use-case';
import { SignContractUseCase } from './application/use-cases/sign-contract.use-case';
import { ListContractsUseCase } from './application/use-cases/list-contracts.use-case';
import { GetContractUseCase } from './application/use-cases/get-contract.use-case';
import { DownloadContractUseCase } from './application/use-cases/download-contract.use-case';
import { ContractsAdminController } from './interface/http/contracts-admin.controller';
import { ContractsController } from './interface/http/contracts.controller';

@Module({
  imports: [QuotesModule],
  controllers: [ContractsAdminController, ContractsController],
  providers: [
    ...contractsInfrastructureProviders,
    BestEffortNotifier,
    ContractCommitter,
    ContractsFacade,
    CreateContractUseCase,
    SignContractUseCase,
    ListContractsUseCase,
    GetContractUseCase,
    DownloadContractUseCase,
  ],
  exports: [ContractsFacade],
})
export class ContractsModule {}
