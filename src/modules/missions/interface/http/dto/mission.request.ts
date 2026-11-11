import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDate,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PageQueryDto } from '@shared/interface/http/dto/page-query.dto';
import {
  ALL_MISSION_STATUSES,
  ALL_TASK_STATUSES,
  CONSULTANT_PROGRESS_STATUSES,
} from '../../../domain';

const STATUSES = ALL_MISSION_STATUSES as string[];
const TASK_STATUSES = ALL_TASK_STATUSES as string[];
const PROGRESS_STATUSES = [...CONSULTANT_PROGRESS_STATUSES] as string[];

export class CreateMissionRequest {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  contractId!: string;

  @ApiProperty({ maxLength: 255 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  deliveryDate?: Date;

  /** documented for Swagger only — read by FileInterceptor */
  @ApiProperty({ type: 'string', format: 'binary', description: 'pdf, doc or docx' })
  @IsOptional()
  contractMission?: unknown;
}

export class ListMissionsQuery extends PageQueryDto {
  @ApiPropertyOptional({ enum: STATUSES })
  @IsOptional()
  @IsIn(STATUSES)
  status?: string;

  @ApiPropertyOptional({ description: 'case-insensitive contains' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  contractId?: string;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  deliveryDateFrom?: Date;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  deliveryDateTo?: Date;
}

export class MissionConsultantItem {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  id!: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isLead?: boolean;
}

export class AssignMissionConsultantsRequest {
  @ApiProperty({ type: [MissionConsultantItem] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => MissionConsultantItem)
  consultants!: MissionConsultantItem[];
}

export class RespondToAssignmentRequest {
  @ApiProperty({ enum: ['accept', 'refuse'] })
  @IsIn(['accept', 'refuse'])
  action!: 'accept' | 'refuse';
}

export class UpdateMissionProgressRequest {
  @ApiPropertyOptional({
    minimum: 0,
    maximum: 100,
    description: 'refused (409) when the mission has tasks',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  progress?: number;

  @ApiPropertyOptional({ enum: PROGRESS_STATUSES })
  @IsOptional()
  @IsIn(PROGRESS_STATUSES)
  status?: string;
}

export class AddMissionTaskRequest {
  @ApiProperty({ maxLength: 255 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ApiPropertyOptional({ minimum: 1, description: '1-based position (appended by default)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  order?: number;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  assigneeConsultantId?: string;
}

export class UpdateMissionTaskRequest {
  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  order?: number;

  @ApiPropertyOptional({ enum: TASK_STATUSES })
  @IsOptional()
  @IsIn(TASK_STATUSES)
  status?: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, description: 'null to un-assign' })
  @IsOptional()
  @IsUUID()
  assigneeConsultantId?: string | null;
}

export class ReorderMissionTasksRequest {
  @ApiProperty({ type: [String], format: 'uuid' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  orderedTaskIds!: string[];
}
