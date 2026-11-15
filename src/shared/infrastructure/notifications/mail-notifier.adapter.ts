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
  /** last mails only (tests read them); bounded so a long-running process does not leak */
  readonly sent: OutboundMail[] = [];
  static readonly KEEP_LAST = 50;

  send(mail: OutboundMail): Promise<void> {
    this.sent.push(mail);
    if (this.sent.length > MailNotifierAdapter.KEEP_LAST) this.sent.shift();
    // never log the body: it may carry an OTP or a temporary password
    this.logger.log(`[mail:log] to=${mail.to} subject="${mail.subject}"`);
    return Promise.resolve();
  }
}
