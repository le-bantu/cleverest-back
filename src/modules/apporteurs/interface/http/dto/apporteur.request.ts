import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsEmail,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { PageQueryDto } from '@shared/interface/http/dto/page-query.dto';
import { CommissionStatus, ProspectStatus } from '../../../domain';

export class CreateProspectRequest {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  company?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  contactPhone?: string;
}

export class ListProspectsQuery extends PageQueryDto {
  @ApiPropertyOptional({ enum: ProspectStatus })
  @IsOptional()
  @IsEnum(ProspectStatus)
  status?: ProspectStatus;
}

export class AdminListProspectsQuery extends ListProspectsQuery {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  apporteurId?: string;
}

export class RejectProspectRequest {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

export class ConvertProspectRequest {
  @ApiProperty({
    type: 'string',
    format: 'binary',
    description: 'contract signed by the client (PDF)',
  })
  @IsOptional()
  signedContract?: unknown;

  @ApiProperty({ type: 'string', format: 'binary', description: 'mission contract (pdf/doc/docx)' })
  @IsOptional()
  contractMission?: unknown;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  quoteTitle!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: ['CONSULTATION', 'ABONNEMENT'] })
  @IsOptional()
  @IsIn(['CONSULTATION', 'ABONNEMENT'])
  quoteType?: string;

  @ApiProperty({ description: 'price of the closed deal (EUR)' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  price!: number;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  missionTitle!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  missionDescription?: string;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  deliveryDate?: Date;

  @ApiPropertyOptional({ description: 'EUR; can be set later' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  commissionAmount?: number;
}

export class ListCommissionsQuery extends PageQueryDto {
  @ApiPropertyOptional({ enum: CommissionStatus })
  @IsOptional()
  @IsEnum(CommissionStatus)
  status?: CommissionStatus;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  missionId?: string;
}

export class AdminListCommissionsQuery extends ListCommissionsQuery {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  apporteurId?: string;
}

export class UpdateCommissionStatusRequest {
  @ApiProperty({ enum: CommissionStatus })
  @IsString()
  status!: string;
}

export class SetCommissionAmountRequest {
  @ApiProperty({ description: 'EUR' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount!: number;
}
