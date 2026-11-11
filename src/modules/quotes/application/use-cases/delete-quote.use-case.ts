import { Inject, Injectable } from '@nestjs/common';
import { UseCase } from '@shared/application/use-case';
import { FILE_STORAGE, FileStoragePort } from '@shared/application/ports/file-storage.port';
import {
  QUOTE_DOCUMENT_REPOSITORY,
  QUOTE_REPOSITORY,
  QuoteActor,
  QuoteDocumentRepository,
  QuoteRepository,
} from '../../domain';
import { QuoteRef } from '../dto/quote.dto';
import { QUOTE_PERMISSIONS, requireAdminWith, toActorRef } from '../services/quote-access';
import { QuoteCommitter } from '../services/quote-committer';
import { loadQuote } from '../services/quote-loader';

/**
 * Client: own main quote while EN_ATTENTE and without subquotes.
 * Admin (`manage-quotes`): any quote except a signed one. Stored files are
 * removed too (rows cascade in the database).
 */
@Injectable()
export class DeleteQuoteUseCase implements UseCase<QuoteRef, void> {
  constructor(
    @Inject(QUOTE_REPOSITORY) private readonly quotes: QuoteRepository,
    @Inject(QUOTE_DOCUMENT_REPOSITORY) private readonly documents: QuoteDocumentRepository,
    @Inject(FILE_STORAGE) private readonly storage: FileStoragePort,
    private readonly committer: QuoteCommitter,
  ) {}

  async execute(input: QuoteRef): Promise<void> {
    const by = toActorRef(input.actor);
    if (by.actor === QuoteActor.ADMIN) requireAdminWith(input.actor, QUOTE_PERMISSIONS.MANAGE);

    const quote = await loadQuote(this.quotes, input.quoteId);
    const subquotes = quote.isSubquote ? [] : await this.quotes.findSubquotes(quote.id);
    quote.assertDeletableBy(by, subquotes.length > 0);

    const affected = [quote, ...subquotes];
    const files = (await Promise.all(affected.map((q) => this.documents.listByQuote(q.id)))).flat();

    await this.quotes.delete(quote.id);
    for (const file of files) await this.storage.delete(file.path);
    for (const q of affected) await this.committer.auditDeletion(q, by.actorId);
  }
}
