import { Module } from '@nestjs/common';
import { quotesInfrastructureProviders } from './infrastructure/quotes.providers';
import { QuoteCommitter } from './application/services/quote-committer';
import { QuoteNotifications } from './application/services/quote-notifications';
import { CreateQuoteUseCase } from './application/use-cases/create-quote.use-case';
import { ListMyQuotesUseCase } from './application/use-cases/list-my-quotes.use-case';
import { ListConsultantQuotesUseCase } from './application/use-cases/list-consultant-quotes.use-case';
import { ListAdminQuotesUseCase } from './application/use-cases/list-admin-quotes.use-case';
import { GetQuoteUseCase } from './application/use-cases/get-quote.use-case';
import { DeleteQuoteUseCase } from './application/use-cases/delete-quote.use-case';
import { ReviewClientQuoteUseCase } from './application/use-cases/review-client-quote.use-case';
import { SubmitConsultantQuoteUseCase } from './application/use-cases/submit-consultant-quote.use-case';
import { ValidateConsultantQuoteUseCase } from './application/use-cases/validate-consultant-quote.use-case';
import { SignOrRejectQuoteUseCase } from './application/use-cases/sign-or-reject-quote.use-case';
import { SplitQuoteUseCase } from './application/use-cases/split-quote.use-case';
import { CreateSubquoteUseCase } from './application/use-cases/create-subquote.use-case';
import { ListSubquotesUseCase } from './application/use-cases/list-subquotes.use-case';
import { AssignConsultantsUseCase } from './application/use-cases/assign-consultants.use-case';
import { GetConsultantShortlistUseCase } from './application/use-cases/get-consultant-shortlist.use-case';
import { SetAdminNotesToConsultantUseCase } from './application/use-cases/set-admin-notes-to-consultant.use-case';
import { UploadQuoteDocumentUseCase } from './application/use-cases/upload-quote-document.use-case';
import { ListQuoteDocumentsUseCase } from './application/use-cases/list-quote-documents.use-case';
import { DownloadQuoteDocumentUseCase } from './application/use-cases/download-quote-document.use-case';
import { DeleteQuoteDocumentUseCase } from './application/use-cases/delete-quote-document.use-case';
import { SetDocumentVisibilityUseCase } from './application/use-cases/set-document-visibility.use-case';
import { QuotesClientController } from './interface/http/quotes-client.controller';
import { QuotesConsultantController } from './interface/http/quotes-consultant.controller';
import { QuotesAdminController } from './interface/http/quotes-admin.controller';
import {
  AdminQuoteDocumentsController,
  ClientQuoteDocumentsController,
  ConsultantQuoteDocumentsController,
} from './interface/http/quote-documents.controller';

const useCases = [
  CreateQuoteUseCase,
  ListMyQuotesUseCase,
  ListConsultantQuotesUseCase,
  ListAdminQuotesUseCase,
  GetQuoteUseCase,
  DeleteQuoteUseCase,
  ReviewClientQuoteUseCase,
  SubmitConsultantQuoteUseCase,
  ValidateConsultantQuoteUseCase,
  SignOrRejectQuoteUseCase,
  SplitQuoteUseCase,
  CreateSubquoteUseCase,
  ListSubquotesUseCase,
  AssignConsultantsUseCase,
  GetConsultantShortlistUseCase,
  SetAdminNotesToConsultantUseCase,
  UploadQuoteDocumentUseCase,
  ListQuoteDocumentsUseCase,
  DownloadQuoteDocumentUseCase,
  DeleteQuoteDocumentUseCase,
  SetDocumentVisibilityUseCase,
];

@Module({
  controllers: [
    // admin first: its static `documents/...` route must win over `:quoteId/documents`
    QuotesAdminController,
    AdminQuoteDocumentsController,
    QuotesClientController,
    ClientQuoteDocumentsController,
    QuotesConsultantController,
    ConsultantQuoteDocumentsController,
  ],
  providers: [...quotesInfrastructureProviders, QuoteCommitter, QuoteNotifications, ...useCases],
  exports: [GetQuoteUseCase],
})
export class QuotesModule {}
