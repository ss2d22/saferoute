import { Injectable, Logger, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { ConfigService } from '@nestjs/config';
import { RoutingService, ORSRoute } from './routing.service';
import { SafetyScoringService, SafetyScore } from '../../safety/services/safety-scoring.service';
import { RouteHistoryRepository } from '../repositories/route-history.repository';
import * as turf from '@turf/turf';
import {
  createLineString,
  bufferLine,
  calculateLengthM,
} from '../../../common/utils/geometry.utils';
import {
  segmentByDistance,
  RouteSegment,
} from '../../../common/utils/segmentation.utils';
import {
  SafeRouteRequestDto,
  CoordinateDto,
} from '../dto/safe-route-request.dto';
import {
  SafeRouteResponseDto,
  RouteOptionDto,
} from '../dto/route-response.dto';
import { generateMapExportUrls } from '../../../common/utils/map-export.utils';

@Injectable()
export class RouteSafetyService {
  private readonly logger = new Logger(RouteSafetyService.name);

  constructor(
    private routingService: RoutingService,
    private safetyScoringService: SafetyScoringService,
    private routeHistoryRepository: RouteHistoryRepository,
    private configService: ConfigService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  /**
   * Find and score route alternatives between origin and destination,
   * considering crime data and user preferences.
   */
  async getSafeRoutes(
    request: SafeRouteRequestDto,
    userId?: string,
  ): Promise<SafeRouteResponseDto> {
    const { origin, destination, mode, preferences } = request;

    // Get configuration defaults
    const safetyWeight =
      preferences?.safetyWeight ||
      this.configService.get('safety.defaultSafetyWeight') ||
      0.8;
    const lookbackMonths =
      preferences?.lookbackMonths ||
      this.configService.get('safety.defaultLookbackMonths') ||
      12;
    const timeOfDay = preferences?.timeOfDay || 'day';
    const bufferM = this.configService.get('safety.defaultRouteBufferM') || 50;

    if (
      !this.routingService.validateCoordinates(origin.lat, origin.lng) ||
      !this.routingService.validateCoordinates(destination.lat, destination.lng)
    ) {
      throw new Error('Invalid coordinates');
    }

    const cacheKey = this.getCacheKey(request);
    const cached = await this.cacheManager.get<SafeRouteResponseDto>(cacheKey);
    if (cached) {
      this.logger.debug(`Cache hit for ${cacheKey}`);
      return cached;
    }

    const orsRoutes = await this.routingService.getRouteAlternatives(
      origin.lng,
      origin.lat,
      destination.lng,
      destination.lat,
      mode,
      3,
    );

    const scoredRoutes: RouteOptionDto[] = [];

    for (const orsRoute of orsRoutes) {
      const routeScore = await this.scoreRoute(
        orsRoute,
        bufferM,
        lookbackMonths,
        timeOfDay,
      );

      const mapUrls = generateMapExportUrls(
        origin.lat,
        origin.lng,
        destination.lat,
        destination.lng,
        orsRoute.geometry.coordinates || [],
        mode,
      );

      scoredRoutes.push({
        distanceM: orsRoute.distance,
        durationS: orsRoute.duration,
        safetyScore: routeScore.safetyScore,
        geometry: orsRoute.geometry,
        instructions: orsRoute.instructions,
        rank: 0, // Will be assigned after sorting
        segments: routeScore.segmentScores,
        googleMapsUrl: mapUrls.googleMapsUrl,
      });
    }

    // Higher safety weight means safety matters more
    scoredRoutes.sort((a, b) => {
      const scoreA =
        a.safetyScore * safetyWeight + (1 - a.distanceM / 10000) * (1 - safetyWeight);
      const scoreB =
        b.safetyScore * safetyWeight + (1 - b.distanceM / 10000) * (1 - safetyWeight);
      return scoreB - scoreA;
    });

    scoredRoutes.forEach((route, index) => {
      route.rank = index + 1;
    });

    const response: SafeRouteResponseDto = {
      routes: scoredRoutes,
      safetyWeight,
      lookbackMonths,
      timeOfDay,
      timestamp: new Date().toISOString(),
    };

    if (userId && scoredRoutes.length > 0) {
      const bestRoute = scoredRoutes[0];
      await this.saveToHistory(userId, request, bestRoute);
    }

    await this.cacheManager.set(cacheKey, response, 3600000); // 1 hour

    return response;
  }

  /**
   * Calculate safety score for a route by querying crime data once
   * and filtering in-memory for each segment.
   */
  private async scoreRoute(
    route: ORSRoute,
    bufferM: number,
    lookbackMonths: number,
    timeOfDay: string,
  ): Promise<{ safetyScore: number; segmentScores: Array<{ index: number; safetyScore: number; riskScore: number; coordinates: number[][] }> }> {
    try {
      if (!route) {
        this.logger.error('Route is null or undefined');
        return { safetyScore: 50, segmentScores: [] };
      }

      if (!route.geometry) {
        this.logger.error('Route geometry is null or undefined');
        return { safetyScore: 50, segmentScores: [] };
      }

      if (!route.geometry.coordinates || !Array.isArray(route.geometry.coordinates)) {
        this.logger.error('Route geometry coordinates is null, undefined, or not an array');
        return { safetyScore: 50, segmentScores: [] };
      }

      this.logger.debug(`Processing route with ${route.geometry.coordinates.length} coordinate points`);

      const routeLine = createLineString(route.geometry.coordinates);
      if (!routeLine) {
        this.logger.error('Failed to create line string from coordinates');
        return { safetyScore: 50, segmentScores: [] };
      }

      const buffered = bufferLine(routeLine, bufferM);
      if (!buffered) {
        this.logger.error('Failed to create buffer around route');
        return { safetyScore: 50, segmentScores: [] };
      }

      this.logger.debug('Created route buffer, now segmenting route...');

      const segments = segmentByDistance(routeLine, 100, 100);

      if (!segments || !Array.isArray(segments)) {
        this.logger.error('segmentByDistance returned null, undefined, or non-array');
        return { safetyScore: 50, segmentScores: [] };
      }

      if (segments.length === 0) {
        this.logger.warn('segmentByDistance returned empty array, using full route');
        return { safetyScore: 100, segmentScores: [] };
      }

      this.logger.debug(`Route segmented into ${segments.length} segments`);

      this.logger.debug('Querying crimes for entire route...');
      const allCrimes = await this.safetyScoringService.getCrimesForRoute(
        buffered,
        lookbackMonths,
      );

      if (!allCrimes || !Array.isArray(allCrimes)) {
        this.logger.warn('No crimes returned from query, using default score');
        return { safetyScore: 100, segmentScores: [] };
      }

      this.logger.debug(`Found ${allCrimes.length} crimes for route`);

      const segmentScores: SafetyScore[] = [];
      const segmentLengths: number[] = [];
      const segmentSafetyDetails: Array<{ index: number; safetyScore: number; riskScore: number; coordinates: number[][] }> = [];

      for (let i = 0; i < segments.length; i++) {
        const segment = segments[i];

        if (!segment || !segment.geometry) {
          this.logger.warn(`Segment ${i} is invalid, skipping`);
          continue;
        }

        const segmentBuffer = bufferLine(segment.geometry, bufferM);
        if (!segmentBuffer) {
          this.logger.warn(`Failed to create buffer for segment ${i}, skipping`);
          continue;
        }

        const segmentCrimes = this.filterCrimesForSegment(allCrimes, segmentBuffer);

        const score = this.safetyScoringService.calculateSafetyScoreFromCrimes(
          segmentCrimes,
          timeOfDay,
        );
        segmentScores.push(score);
        segmentLengths.push(segment.lengthM);

        segmentSafetyDetails.push({
          index: i,
          safetyScore: score.safetyScore,
          riskScore: score.riskScore,
          coordinates: segment.geometry.geometry.coordinates,
        });
      }

      if (segmentScores.length === 0) {
        this.logger.warn('No valid segment scores, using default score');
        return { safetyScore: 100, segmentScores: [] };
      }

      this.logger.debug(`Scored ${segmentScores.length} segments, aggregating...`);

      const aggregated = this.safetyScoringService.aggregateSafetyScores(
        segmentScores,
        segmentLengths,
      );

      this.logger.debug(`Final aggregated safety score: ${aggregated.safetyScore}`);

      return {
        safetyScore: aggregated.safetyScore,
        segmentScores: segmentSafetyDetails
      };
    } catch (error) {
      this.logger.error(`Error scoring route: ${error.message}`);
      this.logger.error(`Error stack: ${error.stack}`);
      return { safetyScore: 50, segmentScores: [] }; // Default middle score on error
    }
  }

  /**
   * Filter crimes that fall within a segment's buffer zone using in-memory spatial checks.
   */
  private filterCrimesForSegment(crimes: any[], segmentBufferWKT: string): any[] {
    try {
      if (!crimes || !Array.isArray(crimes)) {
        return [];
      }

      const bufferPolygon = turf.polygon(this.wktToCoordinates(segmentBufferWKT));

      return crimes.filter(crime => {
        if (!crime || typeof crime.longitude !== 'number' || typeof crime.latitude !== 'number') {
          return false;
        }
        const crimePoint = turf.point([crime.longitude, crime.latitude]);
        return turf.booleanPointInPolygon(crimePoint, bufferPolygon);
      });
    } catch (error) {
      this.logger.warn(`Error filtering crimes for segment: ${error.message}`);
      return [];
    }
  }

  /**
   * Parse WKT POLYGON string into GeoJSON coordinates.
   */
  private wktToCoordinates(wkt: string): number[][][] {
    const coordsMatch = wkt.match(/POLYGON\(\(([^)]+)\)\)/);
    if (!coordsMatch) return [];

    const coords = coordsMatch[1].split(',').map(pair => {
      const [lng, lat] = pair.trim().split(' ').map(Number);
      return [lng, lat];
    });

    return [coords];
  }

  /**
   * Save route details to user's history for later reference.
   */
  private async saveToHistory(
    userId: string,
    request: SafeRouteRequestDto,
    bestRoute: RouteOptionDto,
  ): Promise<void> {
    try {
      await this.routeHistoryRepository.createRouteHistory({
        userId,
        originLat: request.origin.lat,
        originLng: request.origin.lng,
        destinationLat: request.destination.lat,
        destinationLng: request.destination.lng,
        mode: request.mode,
        safetyScoreBest: bestRoute.safetyScore,
        distanceMBest: bestRoute.distanceM,
        durationSBest: bestRoute.durationS,
        requestMeta: {
          safetyWeight: request.preferences?.safetyWeight,
          lookbackMonths: request.preferences?.lookbackMonths,
          timeOfDay: request.preferences?.timeOfDay,
        },
      });
    } catch (error) {
      this.logger.error(`Error saving to history: ${error.message}`);
    }
  }

  /**
   * Create a unique cache key based on request parameters.
   */
  private getCacheKey(request: SafeRouteRequestDto): string {
    const { origin, destination, mode, preferences } = request;
    return `route:${origin.lat},${origin.lng}:${destination.lat},${destination.lng}:${mode}:${preferences?.safetyWeight || 0.8}:${preferences?.lookbackMonths || 12}:${preferences?.timeOfDay || 'day'}`;
  }
}
