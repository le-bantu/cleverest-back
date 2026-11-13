import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsDate, IsNumber, IsOptional, IsPositive, IsUUID } from 'class-validator';
import { PageQueryDto } from '@shared/interface/http/dto/page-query.dto';
import { toBool } from '@shared/interface/http/dto/transforms';

export class SubmitConsultantInvoiceRequest {
  @ApiProperty({ type: 'string', format: 'binary', description: 'pdf / jpg / png' })
  @IsOptional()
  file?: unknown;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  missionId!: string;

  @ApiPropertyOptional({ description: 'EUR; defaults to what remains on the consultant contract' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount?: number;
}

export class ListConsultantInvoicesQuery extends PageQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  missionId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  isPaid?: boolean;

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

export class AdminListConsultantInvoicesQuery extends ListConsultantInvoicesQuery {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  consultantId?: string;
}
