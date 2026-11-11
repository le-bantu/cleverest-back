import { Inject, Injectable, Logger } from '@nestjs/common';
import { NOTIFIER, NotifierPort } from '@shared/application/ports/notifier.port';
import { Quote } from '../../domain';

export const QUOTE_NOTIFICATION_TYPE = 'quote-status';

/**
 * Best-effort user notifications for the quote workflow. A delivery failure
 * never fails the business command that triggered it.
 */
@Injectable()
export class QuoteNotifications {
  private readonly logger = new Logger(QuoteNotifications.name);

  constructor(@Inject(NOTIFIER) private readonly notifier: NotifierPort) {}

  async toUsers(
    userIds: readonly string[],
    quote: Quote,
    title: string,
    body: string,
  ): Promise<void> {
    for (const userId of new Set(userIds)) {
      try {
        await this.notifier.notify(userId, {
          type: QUOTE_NOTIFICATION_TYPE,
          title,
          body,
          data: {
            quoteId: quote.id,
            requestNumber: quote.requestNumber.value,
            status: quote.status,
          },
        });
      } catch (error) {
        this.logger.warn(`Notification to ${userId} failed: ${(error as Error).message}`);
      }
    }
  }
}
