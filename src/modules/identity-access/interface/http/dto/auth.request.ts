import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsIn, IsOptional, IsString, Length, MinLength } from 'class-validator';
import { Role } from '../../../domain';

export class RegisterRequest {
  @ApiProperty({ example: 'client@acme.io' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'S3cret-pass', minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({ enum: Role.SELF_ASSIGNABLE as string[], example: 'client' })
  @IsIn(Role.SELF_ASSIGNABLE as string[])
  role!: string;

  @ApiPropertyOptional({ example: '+33102030405' })
  @IsOptional()
  @IsString()
  phone?: string;
}

export class LoginRequest {
  @ApiProperty({ example: 'client@acme.io' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'S3cret-pass' })
  @IsString()
  @MinLength(1)
  password!: string;
}

export class VerifyOtpRequest {
  @ApiProperty({ format: 'uuid' })
  @IsString()
  challengeId!: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @Length(6, 6)
  code!: string;
}

export class ResendOtpRequest {
  @ApiProperty({ format: 'uuid' })
  @IsString()
  challengeId!: string;
}

export class RefreshRequest {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  refreshToken!: string;
}

export class LogoutRequest {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  refreshToken?: string;
}
