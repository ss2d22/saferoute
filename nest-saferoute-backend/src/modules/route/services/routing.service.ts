import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import * as turf from '@turf/turf';
import { LineString } from 'geojson';
import * as polyline from '@mapbox/polyline';

export interface ORSRoute {
  geometry: any;
  distance: number;
  duration: number;
  instructions?: any[];
}

@Injectable()
export class RoutingService {
  private readonly logger = new Logger(RoutingService.name);
  private readonly apiKey: string;
  private readonly apiUrl: string;

  constructor(
    private configService: ConfigService,
    private httpService: HttpService,
  ) {
    this.apiKey = this.configService.get<string>('externalApis.orsApiKey') || '';
    this.apiUrl = this.configService.get<string>('externalApis.orsApiUrl') || 'https://api.openrouteservice.org';
  }

  /**
   * Get route alternatives from OpenRouteService
   */
  async getRouteAlternatives(
    originLng: number,
    originLat: number,
    destLng: number,
    destLat: number,
    mode: string = 'foot-walking',
    alternatives: number = 3,
  ): Promise<ORSRoute[]> {
    try {
      const url = `${this.apiUrl}/v2/directions/${mode}`;

      const requestBody = {
        coordinates: [
          [originLng, originLat],
          [destLng, destLat],
        ],
        alternative_routes: {
          target_count: alternatives,
          weight_factor: 1.4,
          share_factor: 0.6,
        },
        instructions: true,
        elevation: false,
      };

      this.logger.debug(`Requesting routes from ORS: ${url}`);

      const response = await firstValueFrom(
        this.httpService.post(url, requestBody, {
          headers: {
            'Authorization': this.apiKey,
            'Content-Type': 'application/json',
          },
        }),
      );

      const routes = response.data.routes || [];

      this.logger.debug(`ORS returned ${routes.length} routes`);
      if (routes.length > 0) {
        this.logger.debug(`First route geometry type: ${typeof routes[0].geometry}, is string: ${typeof routes[0].geometry === 'string'}`);
      }

      return routes.map((route: any) => {
        // Decode polyline if geometry is a string
        let geometry = route.geometry;
        if (typeof geometry === 'string') {
          // Polyline returns [[lat, lng], ...], but GeoJSON needs [[lng, lat], ...]
          const decoded = polyline.decode(geometry);
          geometry = {
            type: 'LineString',
            coordinates: decoded.map((coord: [number, number]) => [coord[1], coord[0]]), // Swap lat/lng to lng/lat
          };
        }

        return {
          geometry,
          distance: route.summary?.distance || 0,
          duration: route.summary?.duration || 0,
          instructions: route.segments?.[0]?.steps || [],
        };
      });
    } catch (error) {
      this.logger.error(`ORS API error: ${error.message}`);
      if (error.response) {
        this.logger.error(`ORS response status: ${error.response.status}`);
        this.logger.error(`ORS response data: ${JSON.stringify(error.response.data).substring(0, 500)}`);
      }

      // Fallback: create a simple direct route
      this.logger.warn('Falling back to direct route');
      return [this.createDirectRoute(originLng, originLat, destLng, destLat)];
    }
  }

  /**
   * Create a simple direct route as fallback
   */
  private createDirectRoute(
    originLng: number,
    originLat: number,
    destLng: number,
    destLat: number,
  ): ORSRoute {
    const line = turf.lineString([
      [originLng, originLat],
      [destLng, destLat],
    ]);

    const distance = turf.length(line, { units: 'meters' });

    // Estimate walking duration at 5 km/h
    const duration = (distance / 1000) * (3600 / 5);

    return {
      geometry: line.geometry,
      distance,
      duration,
      instructions: [],
    };
  }

  /**
   * Validate coordinates
   */
  validateCoordinates(lat: number, lng: number): boolean {
    return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
  }

  /**
   * Calculate distance between two points
   */
  calculateDistance(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number,
  ): number {
    const from = turf.point([lng1, lat1]);
    const to = turf.point([lng2, lat2]);
    return turf.distance(from, to, { units: 'meters' });
  }
}
