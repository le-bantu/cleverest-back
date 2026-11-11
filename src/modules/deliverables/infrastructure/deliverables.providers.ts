import { Provider } from '@nestjs/common';
import { DELIVERABLE_REPOSITORY, MISSION_GATEWAY } from '../domain';
import { PrismaDeliverableRepository } from './persistence/prisma-deliverable.repository';
import { MissionsGatewayAdapter } from './adapters/missions-gateway.adapter';

export const deliverablesInfrastructureProviders: Provider[] = [
  PrismaDeliverableRepository,
  MissionsGatewayAdapter,
  { provide: DELIVERABLE_REPOSITORY, useExisting: PrismaDeliverableRepository },
  { provide: MISSION_GATEWAY, useExisting: MissionsGatewayAdapter },
];
