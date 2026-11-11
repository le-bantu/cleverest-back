import { Provider } from '@nestjs/common';
import {
  CONSULTANT_DIRECTORY,
  CONSULTANT_WORKLOAD,
  ConsultantDirectoryPort,
  ConsultantWorkloadPort,
  QUOTE_DOCUMENT_REPOSITORY,
  QUOTE_REPOSITORY,
  QuoteDocumentRepository,
  QuoteRepository,
} from '../domain';
import { PrismaQuoteRepository } from './persistence/prisma-quote.repository';
import { PrismaQuoteDocumentRepository } from './persistence/prisma-quote-document.repository';
import { PrismaConsultantDirectoryAdapter } from './adapters/prisma-consultant-directory.adapter';
import { PrismaConsultantWorkloadAdapter } from './adapters/prisma-consultant-workload.adapter';

export const quotesInfrastructureProviders: Provider[] = [
  PrismaQuoteRepository,
  PrismaQuoteDocumentRepository,
  PrismaConsultantDirectoryAdapter,
  PrismaConsultantWorkloadAdapter,
  { provide: QUOTE_REPOSITORY, useExisting: PrismaQuoteRepository },
  { provide: QuoteRepository, useExisting: PrismaQuoteRepository },
  { provide: QUOTE_DOCUMENT_REPOSITORY, useExisting: PrismaQuoteDocumentRepository },
  { provide: QuoteDocumentRepository, useExisting: PrismaQuoteDocumentRepository },
  { provide: CONSULTANT_DIRECTORY, useExisting: PrismaConsultantDirectoryAdapter },
  { provide: ConsultantDirectoryPort, useExisting: PrismaConsultantDirectoryAdapter },
  { provide: CONSULTANT_WORKLOAD, useExisting: PrismaConsultantWorkloadAdapter },
  { provide: ConsultantWorkloadPort, useExisting: PrismaConsultantWorkloadAdapter },
];
