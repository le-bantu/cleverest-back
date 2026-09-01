import { Module } from '@nestjs/common';
import { SharedModule } from '@shared/shared.module';
import { HealthController } from '@shared/interface/http/health.controller';
import { IdentityAccessModule } from '@modules/identity-access/identity-access.module';

@Module({
  imports: [SharedModule, IdentityAccessModule],
  controllers: [HealthController],
})
export class AppModule {}
