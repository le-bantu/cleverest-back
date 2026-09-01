import { Injectable, Logger } from '@nestjs/common';
import { OtpSenderPort, OtpMessage } from '@shared/application/ports/otp-sender.port';
import { MailNotifierAdapter } from '../notifications/mail-notifier.adapter';

@Injectable()
export class EmailOtpSenderAdapter extends OtpSenderPort {
  private readonly logger = new Logger(EmailOtpSenderAdapter.name);

  constructor(private readonly mail: MailNotifierAdapter) {
    super();
  }

  async send(message: OtpMessage): Promise<void> {
    const minutes = Math.round(message.ttlSeconds / 60);
    await this.mail.send({
      to: message.email,
      subject: 'Votre code de connexion Cleverest',
      text: `Code : ${message.code}\nValable ${minutes} min.`,
    });
    this.logger.log(`OTP (${message.purpose}) sent to ${message.email}`);
  }
}
