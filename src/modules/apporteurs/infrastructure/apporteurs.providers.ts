import { Provider } from '@nestjs/common';
import {
  CLIENT_ONBOARDING,
  CLOSED_DEAL,
  COMMISSION_REPOSITORY,
  PROSPECT_REPOSITORY,
} from '../domain';
import {
  PrismaCommissionRepository,
  PrismaProspectRepository,
} from './persistence/prisma-apporteur.repositories';
import {
  FacadesClosedDealAdapter,
  IdentityClientOnboardingAdapter,
} from './adapters/conversion.adapters';

export const apporteursInfrastructureProviders: Provider[] = [
  PrismaProspectRepository,
  PrismaCommissionRepository,
  IdentityClientOnboardingAdapter,
  FacadesClosedDealAdapter,
  { provide: PROSPECT_REPOSITORY, useExisting: PrismaProspectRepository },
  { provide: COMMISSION_REPOSITORY, useExisting: PrismaCommissionRepository },
  { provide: CLIENT_ONBOARDING, useExisting: IdentityClientOnboardingAdapter },
  { provide: CLOSED_DEAL, useExisting: FacadesClosedDealAdapter },
];
