import { Global, Module } from '@nestjs/common';
import { NOTIFIER, NotifierPort } from '@shared/application/ports/notifier.port';
import { DatabaseNotifierAdapter } from './database-notifier.adapter';
import { MailNotifierAdapter } from './mail-notifier.adapter';

@Global()
@Module({
  providers: [
    MailNotifierAdapter,
    DatabaseNotifierAdapter,
    { provide: NOTIFIER, useExisting: DatabaseNotifierAdapter },
    { provide: NotifierPort, useExisting: DatabaseNotifierAdapter },
  ],
  exports: [NOTIFIER, NotifierPort, MailNotifierAdapter],
})
export class NotifierModule {}
