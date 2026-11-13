import { Provider } from '@nestjs/common';
import {
  CONSULTANT_COMMITMENT,
  CONSULTANT_INVOICE_REPOSITORY,
  INVOICE_MISSION_GATEWAY,
} from '../domain';
import { PrismaConsultantInvoiceRepository } from './persistence/prisma-consultant-invoice.repository';
import {
  ContractsCommitmentAdapter,
  InvoiceMissionsGatewayAdapter,
} from './adapters/gateways.adapter';

export const consultantInvoicesInfrastructureProviders: Provider[] = [
  PrismaConsultantInvoiceRepository,
  InvoiceMissionsGatewayAdapter,
  ContractsCommitmentAdapter,
  { provide: CONSULTANT_INVOICE_REPOSITORY, useExisting: PrismaConsultantInvoiceRepository },
  { provide: INVOICE_MISSION_GATEWAY, useExisting: InvoiceMissionsGatewayAdapter },
  { provide: CONSULTANT_COMMITMENT, useExisting: ContractsCommitmentAdapter },
];
