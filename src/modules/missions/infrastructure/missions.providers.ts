import { Provider } from '@nestjs/common';
import { CONTRACT_GATEWAY, MISSION_REPOSITORY, QUOTE_TEAM } from '../domain';
import { PrismaMissionRepository } from './persistence/prisma-mission.repository';
import { ContractsGatewayAdapter } from './adapters/contracts-gateway.adapter';
import { QuoteTeamAdapter } from './adapters/quote-team.adapter';

export const missionsInfrastructureProviders: Provider[] = [
  PrismaMissionRepository,
  ContractsGatewayAdapter,
  QuoteTeamAdapter,
  { provide: MISSION_REPOSITORY, useExisting: PrismaMissionRepository },
  { provide: CONTRACT_GATEWAY, useExisting: ContractsGatewayAdapter },
  { provide: QUOTE_TEAM, useExisting: QuoteTeamAdapter },
];
