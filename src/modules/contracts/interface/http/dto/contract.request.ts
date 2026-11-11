import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsDate, IsOptional, IsUUID } from 'class-validator';
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
