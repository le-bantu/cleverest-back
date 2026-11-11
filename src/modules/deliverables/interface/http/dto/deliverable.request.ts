import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsDate, IsOptional, IsUUID } from 'class-validator';
import { PageQueryDto } from '@shared/interface/http/dto/page-query.dto';
import { toBool } from '@shared/interface/http/dto/transforms';

export class UploadDeliverableRequest {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  missionId!: string;

  /** documented for Swagger only — read by FileInterceptor */
  @ApiProperty({ type: 'string', format: 'binary' })
  @IsOptional()
  file?: unknown;
}

export class ListDeliverablesQuery extends PageQueryDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'admin only' })
  @IsOptional()
  @IsUUID()
  consultantId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  missionId?: string;

  @ApiPropertyOptional({ description: 'validated by the client' })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  validated?: boolean;

  @ApiPropertyOptional({ description: 'validated by an admin (always true for a client)' })
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  adminValidated?: boolean;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  uploadedFrom?: Date;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  uploadedTo?: Date;
}
