import { ApiProperty } from '@nestjs/swagger';
import {
  IsNumber,
  IsString,
  IsOptional,
  Min,
  Max,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CoordinateDto {
  @ApiProperty({ example: 50.9097, description: 'Latitude' })
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat: number;

  @ApiProperty({ example: -1.4044, description: 'Longitude' })
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng: number;
}

export class RoutePreferencesDto {
  @ApiProperty({
    example: 0.8,
    description: 'Safety weight (0-1)',
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  safetyWeight?: number;

  @ApiProperty({
    example: 12,
    description: 'Lookback months for crime data',
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(60)
  lookbackMonths?: number;

  @ApiProperty({
    example: 'day',
    description: 'Time of day for weighting (night, morning, day, evening)',
    required: false,
  })
  @IsOptional()
  @IsString()
  timeOfDay?: string;
}

export class SafeRouteRequestDto {
  @ApiProperty({ type: CoordinateDto, description: 'Origin coordinates' })
  @ValidateNested()
  @Type(() => CoordinateDto)
  origin: CoordinateDto;

  @ApiProperty({ type: CoordinateDto, description: 'Destination coordinates' })
  @ValidateNested()
  @Type(() => CoordinateDto)
  destination: CoordinateDto;

  @ApiProperty({
    example: 'foot-walking',
    description: 'Travel mode',
    default: 'foot-walking',
  })
  @IsString()
  mode: string;

  @ApiProperty({
    type: RoutePreferencesDto,
    description: 'Route preferences',
    required: false,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => RoutePreferencesDto)
  preferences?: RoutePreferencesDto;
}
