import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsDate, IsNumber, IsOptional, IsPositive, IsUUID } from 'class-validator';
import { PageQueryDto } from '@shared/interface/http/dto/page-query.dto';
import { toBool } from '@shared/interface/http/dto/transforms';

export class SubmitPaymentRequest {
  @ApiProperty({ type: 'string', format: 'binary', description: 'pdf / jpg / png' })
  @IsOptional()
  file?: unknown;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  missionId!: string;

  @ApiProperty({ description: 'EUR' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount!: number;
}

export class ListPaymentsQuery extends PageQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  missionId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  isValidated?: boolean;

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

export class AdminListPaymentsQuery extends ListPaymentsQuery {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  clientId?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description: 'payments of missions this consultant works on',
  })
  @IsOptional()
  @IsUUID()
  consultantId?: string;
}

export class ListClientInvoicesQuery extends PageQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  missionId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  sent?: boolean;
}

export class AdminListClientInvoicesQuery extends ListClientInvoicesQuery {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  clientId?: string;
}
