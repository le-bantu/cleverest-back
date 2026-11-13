import { Global, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import { Clock, SystemClock, CLOCK } from '@shared/kernel';
import type { Env } from './infrastructure/config/env.schema';
import { ConfigModule } from './infrastructure/config/config.module';
import { LoggerModule } from './infrastructure/observability/logger.module';
import { PrismaModule } from './infrastructure/database/prisma.module';
import { FileStorageModule } from './infrastructure/storage/file-storage.module';
import { NotifierModule } from './infrastructure/notifications/notifier.module';
import { OtpModule } from './infrastructure/otp/otp.module';
import { AuditModule } from './infrastructure/audit/audit.module';
import { EventBusModule } from './infrastructure/events/event-bus.module';
import { PdfModule } from './infrastructure/pdf/pdf.module';

import { JwtAuthGuard } from './interface/http/guards/jwt-auth.guard';
import { RolesGuard } from './interface/http/guards/roles.guard';
import { PermissionsGuard } from './interface/http/guards/permissions.guard';
import { AllExceptionsFilter } from './interface/http/filters/all-exceptions.filter';

@Global()
@Module({
  imports: [
    ConfigModule,
    LoggerModule,
    PrismaModule,
    FileStorageModule,
    NotifierModule,
    OtpModule,
    AuditModule,
    EventBusModule,
    PdfModule,
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        secret: config.get('JWT_ACCESS_SECRET', { infer: true }),
      }),
    }),
  ],
  providers: [
    SystemClock,
    { provide: CLOCK, useExisting: SystemClock },
    { provide: Clock, useExisting: SystemClock },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
  exports: [
    ConfigModule,
    LoggerModule,
    PrismaModule,
    FileStorageModule,
    NotifierModule,
    OtpModule,
    AuditModule,
    EventBusModule,
    PdfModule,
    JwtModule,
    CLOCK,
    Clock,
  ],
})
export class SharedModule {}
