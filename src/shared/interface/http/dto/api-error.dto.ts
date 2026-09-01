import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ApiErrorDto {
  @ApiProperty({ example: 409 })
  statusCode!: number;

  @ApiProperty({ example: 'QuoteTransitionNotAllowed' })
  error!: string;

  @ApiProperty({ example: 'Cannot move quote from COTÉ to SIGNÉ_CLIENT' })
  message!: string;

  @ApiPropertyOptional()
  details?: unknown;

  @ApiProperty({ example: '/api/quotes/123/sign' })
  path!: string;

  @ApiProperty({ example: '2026-09-01T12:00:00.000Z' })
  timestamp!: string;
}

export class PageMetaDto {
  @ApiProperty() page!: number;
  @ApiProperty() perPage!: number;
  @ApiProperty() total!: number;
  @ApiProperty() totalPages!: number;
}
