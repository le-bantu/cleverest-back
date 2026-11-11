import { Inject, Injectable, Logger } from '@nestjs/common';
import { NOTIFIER, NotificationEvent, NotifierPort } from '../ports/notifier.port';

/**
 * Delivers notifications without ever failing the business command that
 * triggered them: errors are logged and swallowed, duplicates collapsed.
 */
@Injectable()
export class BestEffortNotifier {
  private readonly logger = new Logger(BestEffortNotifier.name);

  constructor(@Inject(NOTIFIER) private readonly notifier: NotifierPort) {}

  async notify(userIds: readonly (string | null | undefined)[], event: NotificationEvent) {
    for (const userId of new Set(userIds.filter((id): id is string => !!id))) {
      try {
        await this.notifier.notify(userId, event);
      } catch (error) {
        this.logger.warn(`Notification to ${userId} failed: ${(error as Error).message}`);
      }
    }
  }
}
