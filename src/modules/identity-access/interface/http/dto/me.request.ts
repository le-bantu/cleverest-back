import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsObject, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateMeRequest {
  @ApiPropertyOptional()
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

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  profile?: Record<string, unknown>;
}

export class ToggleTwoFactorRequest {
  @ApiProperty({ example: true })
  @IsBoolean()
  enabled!: boolean;
}
