import { ApiProperty } from '@nestjs/swagger';

export class SegmentSafetyDto {
  @ApiProperty({ example: 0, description: 'Segment index' })
  index: number;

  @ApiProperty({ example: 85.5, description: 'Safety score for this segment (0-100)' })
  safetyScore: number;

  @ApiProperty({ example: 0.15, description: 'Risk score for this segment (0-1)' })
  riskScore: number;

  @ApiProperty({ example: [[51.5074, -0.1278], [51.5075, -0.1279]], description: 'Segment coordinates' })
  coordinates: number[][];
}

export class RouteOptionDto {
  @ApiProperty({ example: 1250.5, description: 'Distance in meters' })
  distanceM: number;

  @ApiProperty({ example: 900, description: 'Duration in seconds' })
  durationS: number;

  @ApiProperty({ example: 85.5, description: 'Safety score (0-100)' })
  safetyScore: number;

  @ApiProperty({ description: 'Route geometry as GeoJSON' })
  geometry: any;

  @ApiProperty({ description: 'Turn-by-turn instructions', required: false })
  instructions?: any[];

  @ApiProperty({ example: 1, description: 'Route rank (1 = safest)' })
  rank: number;

  @ApiProperty({ type: [SegmentSafetyDto], description: 'Per-segment safety scores', required: false })
  segments?: SegmentSafetyDto[];

  @ApiProperty({ example: 'https://www.google.com/maps/dir/?api=1&origin=...', description: 'Google Maps URL with waypoints for route export', required: false })
  googleMapsUrl?: string;
}

export class SafeRouteResponseDto {
  @ApiProperty({ type: [RouteOptionDto], description: 'Route alternatives' })
  routes: RouteOptionDto[];

  @ApiProperty({ example: 0.8, description: 'Safety weight used' })
  safetyWeight: number;

  @ApiProperty({ example: 12, description: 'Lookback months used' })
  lookbackMonths: number;

  @ApiProperty({ example: 'day', description: 'Time of day used' })
  timeOfDay: string;

  @ApiProperty({ example: '2025-01-19T12:00:00Z', description: 'Request timestamp' })
  timestamp: string;
}
