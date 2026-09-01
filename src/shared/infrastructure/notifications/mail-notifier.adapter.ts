import { Injectable, Logger } from '@nestjs/common';

export interface OutboundMail {
  to: string;
  subject: string;
  text: string;
}

/**
 * Mail transport. `MAIL_DRIVER=log` (default) just logs — no real delivery,
 * mirroring the legacy behaviour but behind a port so tests can assert on it.
 */
@Injectable()
export class MailNotifierAdapter {
  private readonly logger = new Logger(MailNotifierAdapter.name);
  readonly sent: OutboundMail[] = [];

  send(mail: OutboundMail): Promise<void> {
    this.sent.push(mail);
    this.logger.log(`[mail:log] to=${mail.to} subject="${mail.subject}"`);
    return Promise.resolve();
  }
}
