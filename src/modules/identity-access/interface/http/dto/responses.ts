import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ProfileResponse {
  @ApiProperty({ example: 'client' })
  kind!: string;

  @ApiProperty({ type: 'object', additionalProperties: true })
  data!: Record<string, unknown>;
}

export class UserResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ nullable: true })
  email!: string | null;

  @ApiProperty({ nullable: true })
  phone!: string | null;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty()
  twoFactorEnabled!: boolean;

  @ApiProperty({ type: [String] })
  roles!: string[];

  @ApiProperty({ type: [String] })
  permissions!: string[];

  @ApiPropertyOptional({ type: ProfileResponse, nullable: true })
  profile!: ProfileResponse | null;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;
}

export class TokenPairResponse {
  @ApiProperty({ example: false })
  otpRequired!: false;

  @ApiProperty()
  accessToken!: string;

  @ApiProperty()
  refreshToken!: string;

  @ApiProperty({ example: 900 })
  expiresInSeconds!: number;

  @ApiProperty({ type: UserResponse })
  user!: UserResponse;
}

export class OtpRequiredResponse {
  @ApiProperty({ example: true })
  otpRequired!: true;

  @ApiProperty({ format: 'uuid' })
  challengeId!: string;
}
