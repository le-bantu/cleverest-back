import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDate,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { PageQueryDto } from '@shared/interface/http/dto/page-query.dto';
import {
  ALL_QUOTE_STATUSES,
  ALL_QUOTE_TYPES,
  ALL_VISIBLE_TO,
  VALIDATION_TARGETS,
} from '../../../domain';

const STATUSES = ALL_QUOTE_STATUSES as string[];
const TYPES = ALL_QUOTE_TYPES as string[];

type TransformArgs = { value: unknown; obj?: Record<string, unknown>; key?: string };

/** Raw input value (implicit conversion would already have turned "false" into true). */
const raw = ({ value, obj, key }: TransformArgs): unknown =>
  obj && key && key in obj ? obj[key] : value;

/** Query-string booleans: "true"/"1" → true, "false"/"0" → false. */
export const toBool = (args: TransformArgs): unknown => {
  const value = raw(args);
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  if (['true', '1'].includes(String(value).toLowerCase())) return true;
  if (['false', '0'].includes(String(value).toLowerCase())) return false;
  return value;
};

/** Multipart arrays: repeated field, JSON array or comma-separated list. */
export const toArray = (args: TransformArgs): unknown => {
  const value = raw(args);
  if (value === undefined || value === null || value === '') return undefined;
  if (Array.isArray(value)) return value;
  const text = String(value).trim();
  if (text.startsWith('[')) {
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return value;
    }
  }
  return text
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
};

export class CreateQuoteRequest {
  @ApiProperty({ enum: TYPES })
  @IsIn(TYPES)
  type!: string;

  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  description!: string;
}

class DateRangeQuery extends PageQueryDto {
  @ApiPropertyOptional({ enum: STATUSES })
  @IsOptional()
  @IsIn(STATUSES)
  status?: string;

  @ApiPropertyOptional({ enum: TYPES })
  @IsOptional()
  @IsIn(TYPES)
  type?: string;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  dateMin?: Date;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  dateMax?: Date;
}

export class ListMyQuotesQuery extends DateRangeQuery {}

export class ListConsultantQuotesQuery extends PageQueryDto {
  @ApiPropertyOptional({ enum: STATUSES })
  @IsOptional()
  @IsIn(STATUSES)
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  isSubquote?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  isValidated?: boolean;
}

export class ListAdminQuotesQuery extends DateRangeQuery {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  clientId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  isValidated?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  isSubquote?: boolean;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  parentQuoteId?: string;
}

export class SignQuoteRequest {
  @ApiProperty({ enum: ['sign', 'reject'] })
  @IsIn(['sign', 'reject'])
  action!: 'sign' | 'reject';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  rejectedReason?: string;
}

export class SubmitConsultantQuoteRequest {
  @ApiProperty({ example: 1500 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  price!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  consultantNotes?: string;
}

class AdminNotesFields {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  adminNotes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  adminNotesToConsultant?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  rejectedReason?: string;
}

export class ReviewQuoteRequest extends AdminNotesFields {
  @ApiProperty({ enum: STATUSES })
  @IsIn(STATUSES)
  status!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  adminNotesToClient?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  description?: string;

  @ApiPropertyOptional({ description: 'required only when status = VALIDÉ_ADMIN and no price yet' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  price?: number;
}

export class ValidateQuoteRequest extends AdminNotesFields {
  @ApiProperty({ enum: VALIDATION_TARGETS as string[] })
  @IsIn(VALIDATION_TARGETS as string[])
  status!: string;
}

export class AdminNotesToConsultantRequest {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  adminNotesToConsultant!: string;
}

export class SplitQuoteRequest {
  @ApiProperty({ type: [String], format: 'uuid' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  consultants!: string[];
}

export class CreateSubquoteRequest {
  @ApiProperty({ maxLength: 255 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  description!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  consultantId!: string;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  consultantDeadline?: Date;
}

export class ConsultantAssignmentItem {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  id!: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isLead?: boolean;
}

export class AssignConsultantsRequest {
  @ApiProperty({ type: [ConsultantAssignmentItem] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ConsultantAssignmentItem)
  consultants!: ConsultantAssignmentItem[];

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  consultantDeadline?: Date;
}

export class UploadDocumentRequest {
  /** documented for Swagger only — the binary is read by FileInterceptor, not the body */
  @ApiProperty({ type: 'string', format: 'binary' })
  @IsOptional()
  file?: unknown;

  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  label?: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;

  @ApiPropertyOptional({ enum: ALL_VISIBLE_TO as string[] })
  @IsOptional()
  @IsIn(ALL_VISIBLE_TO as string[])
  visibility?: string;

  @ApiPropertyOptional({ type: [String], format: 'uuid' })
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsUUID('all', { each: true })
  visibleUsers?: string[];
}

export class DocumentVisibilityRequest {
  @ApiProperty({ enum: ALL_VISIBLE_TO as string[] })
  @IsIn(ALL_VISIBLE_TO as string[])
  visibleTo!: string;

  @ApiPropertyOptional({ type: [String], format: 'uuid' })
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  visibleUsers?: string[];
}
