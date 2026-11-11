import { Inject, Injectable } from '@nestjs/common';
import { Clock, CLOCK } from '@shared/kernel';
import { UseCase } from '@shared/application/use-case';
import { FILE_STORAGE, FileStoragePort } from '@shared/application/ports/file-storage.port';
import {
  DocumentVisibility,
  QUOTE_DOCUMENT_REPOSITORY,
  QUOTE_REPOSITORY,
  QuoteActor,
  QuoteDocument,
  QuoteDocumentRepository,
  QuoteRepository,
  VisibleTo,
} from '../../domain';
import { UploadQuoteDocumentInput } from '../dto/quote.dto';
import { assertUsersAreParties, loadDocumentContext } from '../services/document-access';
import { QuoteNotifications } from '../services/quote-notifications';
import { QuoteDocumentView, toQuoteDocumentView } from '../views/quote.views';

const extensionOf = (name: string): string =>
  /\.[A-Za-z0-9]{1,10}$/.exec(name)?.[0].toLowerCase() ?? '';

@Injectable()
export class UploadQuoteDocumentUseCase implements UseCase<
  UploadQuoteDocumentInput,
  QuoteDocumentView
> {
  constructor(
    @Inject(QUOTE_REPOSITORY) private readonly quotes: QuoteRepository,
    @Inject(QUOTE_DOCUMENT_REPOSITORY) private readonly documents: QuoteDocumentRepository,
    @Inject(FILE_STORAGE) private readonly storage: FileStoragePort,
    private readonly notifications: QuoteNotifications,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(input: UploadQuoteDocumentInput): Promise<QuoteDocumentView> {
    const { by, quote, parties } = await loadDocumentContext(
      this.quotes,
      input.actor,
      input.quoteId,
    );
    const visibility = input.visibility
      ? DocumentVisibility.create(input.visibility, input.visibleUsers ?? [])
      : null;
    if (visibility?.visibleTo === VisibleTo.SPECIFIC) {
      assertUsersAreParties(visibility.userIds, parties);
    }

    const id = this.documents.nextIdentity();
    const key = `quotes/${quote.id}/${id}${extensionOf(input.file.originalName)}`;
    const document = QuoteDocument.upload(
      {
        id,
        quoteId: quote.id,
        uploadedById: by.actorId,
        uploadedByRole: by.actor,
        label: input.label,
        comment: input.comment,
        path: key,
        originalName: input.file.originalName,
        mimeType: input.file.mimeType,
        size: input.file.size,
        visibility,
      },
      this.clock.now(),
    );

    await this.storage.put({
      key,
      content: input.file.buffer,
      contentType: input.file.mimeType ?? undefined,
    });
    try {
      await this.documents.save(document);
    } catch (error) {
      await this.storage.delete(key);
      throw error;
    }

    const recipients = [quote.clientId, ...quote.consultantIds].filter(
      (userId) =>
        userId !== by.actorId &&
        document.isVisibleTo(
          {
            userId,
            actor: userId === quote.clientId ? QuoteActor.CLIENT : QuoteActor.CONSULTANT,
          },
          parties,
        ),
    );
    await this.notifications.toUsers(
      recipients,
      quote,
      'Nouveau document disponible',
      `Nouveau document : ${document.label ?? document.originalName}`,
    );
    return toQuoteDocumentView(document);
  }
}
