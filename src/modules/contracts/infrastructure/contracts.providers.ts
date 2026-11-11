import { Provider } from '@nestjs/common';
import { CONTRACT_REPOSITORY, QUOTE_GATEWAY } from '../domain';
import { PrismaContractRepository } from './persistence/prisma-contract.repository';
import { QuotesGatewayAdapter } from './adapters/quotes-gateway.adapter';

export const contractsInfrastructureProviders: Provider[] = [
  PrismaContractRepository,
  QuotesGatewayAdapter,
  { provide: CONTRACT_REPOSITORY, useExisting: PrismaContractRepository },
  { provide: QUOTE_GATEWAY, useExisting: QuotesGatewayAdapter },
];
