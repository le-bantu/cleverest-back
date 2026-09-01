import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { DEFAULT_PAGE, DEFAULT_PER_PAGE, MAX_PER_PAGE, type PageQuery } from '@shared/kernel';

export class PageQueryDto implements PageQuery {
  @ApiPropertyOptional({ minimum: 1, default: DEFAULT_PAGE })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = DEFAULT_PAGE;

  @ApiPropertyOptional({ minimum: 1, maximum: MAX_PER_PAGE, default: DEFAULT_PER_PAGE })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PER_PAGE)
  perPage: number = DEFAULT_PER_PAGE;

  @ApiPropertyOptional({ description: 'field:direction, e.g. createdAt:desc' })
  @IsOptional()
  @IsString()
  sort?: string;
}
