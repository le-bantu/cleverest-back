import { Inject, Injectable } from '@nestjs/common';
import { UseCase } from '@shared/application/use-case';
import { FILE_STORAGE, FileStoragePort } from '@shared/application/ports/file-storage.port';
import {
  documentNotFound,
  QUOTE_DOCUMENT_REPOSITORY,
  QUOTE_REPOSITORY,
  QuoteDocumentRepository,
  QuoteRepository,
} from '../../domain';
import { QuoteDocumentRef } from '../dto/quote.dto';
import { loadDocumentContext } from '../services/document-access';

/** Uploader or admin only. */
@Injectable()
export class DeleteQuoteDocumentUseCase implements UseCase<QuoteDocumentRef, void> {
  constructor(
    @Inject(QUOTE_REPOSITORY) private readonly quotes: QuoteRepository,
    @Inject(QUOTE_DOCUMENT_REPOSITORY) private readonly documents: QuoteDocumentRepository,
    @Inject(FILE_STORAGE) private readonly storage: FileStoragePort,
  ) {}

  async execute(input: QuoteDocumentRef): Promise<void> {
    const { viewer, parties, quote } = await loadDocumentContext(
      this.quotes,
      input.actor,
      input.quoteId,
    );
    const document = await this.documents.findById(input.documentId);
    if (!document || document.quoteId !== quote.id || !document.isVisibleTo(viewer, parties)) {
      throw documentNotFound(input.documentId);
    }
    document.assertDeletableBy(viewer);
    await this.documents.delete(document.id);
    await this.storage.delete(document.path);
  }
}
