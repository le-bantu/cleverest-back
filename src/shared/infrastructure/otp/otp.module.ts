import { Global, Module } from '@nestjs/common';
import { OTP_SENDER, OtpSenderPort } from '@shared/application/ports/otp-sender.port';
import { NotifierModule } from '../notifications/notifier.module';
import { EmailOtpSenderAdapter } from './email-otp-sender.adapter';

@Global()
@Module({
  imports: [NotifierModule],
  providers: [
    EmailOtpSenderAdapter,
    { provide: OTP_SENDER, useExisting: EmailOtpSenderAdapter },
    { provide: OtpSenderPort, useExisting: EmailOtpSenderAdapter },
  ],
  exports: [OTP_SENDER, OtpSenderPort],
})
export class OtpModule {}
