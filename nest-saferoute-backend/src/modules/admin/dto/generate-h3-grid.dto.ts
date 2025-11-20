import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsInt, IsOptional, Min, Max } from 'class-validator';

export class GenerateH3GridDto {
  @ApiProperty({
    description: 'Month for which to generate H3 grid in YYYY-MM format',
    example: '2024-09',
  })
  @IsDateString()
  month: string;

  @ApiProperty({
    description: 'Number of months to look back for crime data',
    example: 12,
    default: 12,
    required: false,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(120)
  lookbackMonths?: number;

  @ApiProperty({
    description: 'H3 resolution (10 = ~73m edge length)',
    example: 10,
    default: 10,
    required: false,
  })
  @IsOptional()
  @IsInt()
  @Min(8)
  @Max(12)
  resolution?: number;
}
