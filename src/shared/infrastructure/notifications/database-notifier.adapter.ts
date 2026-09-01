import { Injectable } from '@nestjs/common';
import { NotifierPort, NotificationEvent } from '@shared/application/ports/notifier.port';
import { PrismaService } from '../database/prisma.service';
import { MailNotifierAdapter } from './mail-notifier.adapter';

/**
 * Primary notifier: always writes a row on the `database` channel; also sends
 * an email when the event opted in via `event.email`.
 */
@Injectable()
export class DatabaseNotifierAdapter extends NotifierPort {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailNotifierAdapter,
  ) {
    super();
  }

  async notify(userId: string, event: NotificationEvent): Promise<void> {
    await this.prisma.notification.create({
      data: {
        userId,
        type: event.type,
        title: event.title,
        body: event.body,
        data: (event.data ?? undefined) as never,
      },
    });
    if (event.email) {
      await this.mail.send(event.email);
    }
  }
}
