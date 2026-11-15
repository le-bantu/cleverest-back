import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsOptional } from 'class-validator';

/** Monthly series window (UTC months). Default: the last 12 months; at most 60. */
export class DashboardPeriodQuery {
  @ApiPropertyOptional({ type: String, format: 'date-time', description: 'first month included' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @ApiPropertyOptional({ type: String, format: 'date-time', description: 'last month included' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;
}
