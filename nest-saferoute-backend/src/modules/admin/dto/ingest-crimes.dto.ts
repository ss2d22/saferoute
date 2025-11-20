import { ApiProperty } from '@nestjs/swagger';
import { IsDateString } from 'class-validator';

export class IngestCrimesDto {
  @ApiProperty({
    description: 'Start month in YYYY-MM format',
    example: '2024-01',
  })
  @IsDateString()
  startMonth: string;

  @ApiProperty({
    description: 'End month in YYYY-MM format',
    example: '2024-12',
  })
  @IsDateString()
  endMonth: string;
}
