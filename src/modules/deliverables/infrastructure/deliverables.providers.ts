import { Provider } from '@nestjs/common';
import { CONSULTANT_ENGAGEMENT, DELIVERABLE_REPOSITORY, MISSION_GATEWAY } from '../domain';
import { PrismaDeliverableRepository } from './persistence/prisma-deliverable.repository';
import { MissionsGatewayAdapter } from './adapters/missions-gateway.adapter';
import { ContractsEngagementAdapter } from './adapters/contracts-engagement.adapter';

export const deliverablesInfrastructureProviders: Provider[] = [
  PrismaDeliverableRepository,
  MissionsGatewayAdapter,
  ContractsEngagementAdapter,
  { provide: DELIVERABLE_REPOSITORY, useExisting: PrismaDeliverableRepository },
  { provide: MISSION_GATEWAY, useExisting: MissionsGatewayAdapter },
  { provide: CONSULTANT_ENGAGEMENT, useExisting: ContractsEngagementAdapter },
];
