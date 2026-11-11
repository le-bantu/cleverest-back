import { Provider } from '@nestjs/common';
import { CONSULTANT_CONTRACT_REPOSITORY, CONTRACT_REPOSITORY, QUOTE_GATEWAY } from '../domain';
import { PrismaContractRepository } from './persistence/prisma-contract.repository';
import { PrismaConsultantContractRepository } from './persistence/prisma-consultant-contract.repository';
import { QuotesGatewayAdapter } from './adapters/quotes-gateway.adapter';

export const contractsInfrastructureProviders: Provider[] = [
  PrismaContractRepository,
  PrismaConsultantContractRepository,
  QuotesGatewayAdapter,
  { provide: CONTRACT_REPOSITORY, useExisting: PrismaContractRepository },
  { provide: CONSULTANT_CONTRACT_REPOSITORY, useExisting: PrismaConsultantContractRepository },
  { provide: QUOTE_GATEWAY, useExisting: QuotesGatewayAdapter },
];
