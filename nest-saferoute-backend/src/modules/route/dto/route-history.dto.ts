import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsNumber, Min } from 'class-validator';

export class RouteHistoryQueryDto {
  @ApiProperty({
    example: 20,
    description: 'Number of records to return',
    required: false,
    default: 20,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  limit?: number = 20;

  @ApiProperty({
    example: 0,
    description: 'Number of records to skip',
    required: false,
    default: 0,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  offset?: number = 0;
}

export class RouteHistoryItemDto {
  @ApiProperty({ description: 'History record ID' })
  id: string;

  @ApiProperty({ description: 'Origin latitude' })
  originLat: number;

  @ApiProperty({ description: 'Origin longitude' })
  originLng: number;

  @ApiProperty({ description: 'Destination latitude' })
  destinationLat: number;

  @ApiProperty({ description: 'Destination longitude' })
  destinationLng: number;

  @ApiProperty({ description: 'Travel mode' })
  mode: string;

  @ApiProperty({ description: 'Best route safety score' })
  safetyScoreBest: number;

  @ApiProperty({ description: 'Best route distance in meters' })
  distanceMBest: number;

  @ApiProperty({ description: 'Best route duration in seconds' })
  durationSBest: number;

  @ApiProperty({ description: 'Timestamp' })
  createdAt: Date;
}

export class RouteHistoryResponseDto {
  @ApiProperty({ type: [RouteHistoryItemDto] })
  history: RouteHistoryItemDto[];

  @ApiProperty({ description: 'Total count' })
  total: number;

  @ApiProperty({ description: 'Limit used' })
  limit: number;

  @ApiProperty({ description: 'Offset used' })
  offset: number;
}
