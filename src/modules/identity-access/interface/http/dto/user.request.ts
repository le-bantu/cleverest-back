import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { MAX_PER_PAGE } from '@shared/kernel';
import { Role } from '../../../domain';

export class CreateUserRequest {
  @ApiProperty({ example: 'consultant@acme.io' })
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({ enum: Role.ALL as string[], isArray: true, example: ['consultant'] })
  @IsArray()
  @ArrayMinSize(1)
  @IsIn(Role.ALL as string[], { each: true })
  roles!: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  profile?: Record<string, unknown>;
}

export class UpdateUserRequest {
  @ApiPropertyOptional({ example: 'new@acme.io' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ minLength: 8 })
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ enum: Role.ALL as string[], isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsIn(Role.ALL as string[], { each: true })
  roles?: string[];

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  profile?: Record<string, unknown>;
}

export class ListUsersQuery {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: MAX_PER_PAGE, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PER_PAGE)
  perPage = 20;

  @ApiPropertyOptional({ enum: Role.ALL as string[] })
  @IsOptional()
  @IsIn(Role.ALL as string[])
  role?: string;

  @ApiPropertyOptional({ description: 'substring match on email' })
  @IsOptional()
  @IsString()
  search?: string;
}

export class ListAllUsersQuery {
  @ApiPropertyOptional({ enum: Role.ALL as string[] })
  @IsOptional()
  @IsIn(Role.ALL as string[])
  role?: string;

  @ApiPropertyOptional({ description: 'consultant expertise domain' })
  @IsOptional()
  @IsString()
  expertise?: string;
}
