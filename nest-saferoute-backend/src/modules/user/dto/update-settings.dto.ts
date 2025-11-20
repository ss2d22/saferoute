import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsNumber, IsOptional, Min, Max } from 'class-validator';

export class UpdateSettingsDto {
  @ApiProperty({
    example: true,
    description: 'Enable/disable route history tracking',
    required: false,
  })
  @IsOptional()
  @IsBoolean()
  historyEnabled?: boolean;

  @ApiProperty({
    example: 0.8,
    description: 'Default safety weight for route calculations (0-1)',
    required: false,
    minimum: 0,
    maximum: 1,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  defaultSafetyWeight?: number;

  @ApiProperty({
    example: 12,
    description: 'Default lookback period in months for crime data',
    required: false,
    minimum: 1,
    maximum: 60,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(60)
  defaultLookbackMonths?: number;
}
