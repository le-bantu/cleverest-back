import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsDate, IsNumber, IsOptional, IsPositive, IsUUID } from 'class-validator';
import { PageQueryDto } from '@shared/interface/http/dto/page-query.dto';
import { toBool } from '@shared/interface/http/dto/transforms';

/** documented for Swagger only — the binary is read by FileInterceptor */
class FileField {
  @ApiProperty({ type: 'string', format: 'binary', description: 'PDF' })
  @IsOptional()
  file?: unknown;
}

export class CreateContractRequest extends FileField {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  quoteId!: string;
}

export class SignContractRequest extends FileField {}

export class ListContractsQuery extends PageQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  quoteId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  signed?: boolean;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  dateFrom?: Date;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  dateTo?: Date;
}

export class CreateConsultantContractRequest extends FileField {
  @ApiProperty({
    format: 'uuid',
    description: 'the quote (usually a subquote) the consultant priced',
  })
  @IsUUID()
  quoteId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  consultantId!: string;

  @ApiPropertyOptional({
    description: 'EUR; defaults to the subquote price, required on a main quote',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount?: number;
}

export class ListConsultantContractsQuery extends PageQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  quoteId?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'main quote (includes its subquotes)' })
  @IsOptional()
  @IsUUID()
  rootQuoteId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  signed?: boolean;
}

export class AdminListConsultantContractsQuery extends ListConsultantContractsQuery {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  consultantId?: string;
}
