import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiTags } from '@nestjs/swagger';
import { Public } from './decorators/public.decorator';
import { PrismaService } from '@shared/infrastructure/database/prisma.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /** 200 when the database answers, 503 otherwise (container / load-balancer probe). */
  @Public()
  @SkipThrottle()
  @Get()
  async check(@Res({ passthrough: true }) res: Response) {
    let db = 'up';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      db = 'down';
    }
    res.status(db === 'up' ? 200 : 503);
    return { status: db === 'up' ? 'ok' : 'degraded', db, timestamp: new Date().toISOString() };
  }
}
