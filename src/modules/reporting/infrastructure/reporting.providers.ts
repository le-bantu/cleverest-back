import { Provider } from '@nestjs/common';
import { REPORTING_QUERIES } from '../application/ports/reporting-queries.port';
import { PrismaReportingRepository } from './persistence/prisma-reporting.repository';

export const reportingInfrastructureProviders: Provider[] = [
  PrismaReportingRepository,
  { provide: REPORTING_QUERIES, useExisting: PrismaReportingRepository },
];
