import { Provider } from '@nestjs/common';
import {
  BILLING_DIRECTORY,
  CLIENT_INVOICE_REPOSITORY,
  PAYMENT_MISSION_GATEWAY,
  PAYMENT_REPOSITORY,
} from '../domain';
import { PrismaPaymentRepository } from './persistence/prisma-payment.repository';
import { PrismaClientInvoiceRepository } from './persistence/prisma-client-invoice.repository';
import { PaymentMissionsGatewayAdapter } from './adapters/missions-gateway.adapter';
import { PrismaBillingDirectoryAdapter } from './adapters/prisma-billing-directory.adapter';

export const paymentsInfrastructureProviders: Provider[] = [
  PrismaPaymentRepository,
  PrismaClientInvoiceRepository,
  PaymentMissionsGatewayAdapter,
  PrismaBillingDirectoryAdapter,
  { provide: PAYMENT_REPOSITORY, useExisting: PrismaPaymentRepository },
  { provide: CLIENT_INVOICE_REPOSITORY, useExisting: PrismaClientInvoiceRepository },
  { provide: PAYMENT_MISSION_GATEWAY, useExisting: PaymentMissionsGatewayAdapter },
  { provide: BILLING_DIRECTORY, useExisting: PrismaBillingDirectoryAdapter },
];
