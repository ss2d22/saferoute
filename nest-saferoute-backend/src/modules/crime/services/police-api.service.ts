import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

interface PoliceAPICrime {
  id?: string;
  month: string;
  category: string;
  location_type?: string;
  context?: string;
  persistent_id?: string;
  location?: {
    latitude?: string | number;
    longitude?: string | number;
    street?: {
      name?: string;
    };
  };
  outcome_status?: {
    category?: string;
  };
}

export interface NormalizedCrime {
  externalId?: string;
  month: string;
  category: string;
  crimeType: string;
  context: string;
  persistentId?: string;
  latitude: number;
  longitude: number;
  streetName: string;
  outcomeStatus?: string;
}

type Coordinate = [number, number]; // [lat, lng]

@Injectable()
export class PoliceAPIService {
  private readonly logger = new Logger(PoliceAPIService.name);
  private readonly baseUrl: string;
  private readonly timeout = 30000; // 30 seconds
  private readonly maxRetries = 3;
  private readonly retryDelays = [1000, 2000, 4000]; // Exponential backoff in ms

  constructor(
    private httpService: HttpService,
    private configService: ConfigService,
  ) {
    this.baseUrl = this.configService.get<string>('externalApis.policeApiBaseUrl') || 'https://data.police.uk/api';
  }

  /**
   * Get street-level crimes for a polygon area
   */
  async getCrimesStreet(
    polygon: Coordinate[],
    month: Date,
    category: string = 'all-crime',
  ): Promise<{ crimes: PoliceAPICrime[]; statusCode: number }> {
    // Format polygon for API (lat,lng:lat,lng:...)
    const polyStr = polygon.map(([lat, lng]) => `${lat},${lng}`).join(':');

    // Format date (YYYY-MM)
    const year = month.getFullYear();
    const monthStr = String(month.getMonth() + 1).padStart(2, '0');
    const dateStr = `${year}-${monthStr}`;

    const url = `${this.baseUrl}/crimes-street/${category}`;
    const params = { poly: polyStr, date: dateStr };

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const response = await firstValueFrom(
          this.httpService.get(url, {
            params,
            timeout: this.timeout,
          }),
        );

        if (response.status === 200) {
          const crimes = response.data;
          return { crimes, statusCode: 200 };
        }
      } catch (error) {
        const statusCode = error.response?.status;

        if (statusCode === 503) {
          // Too many results (>10k crimes)
          return { crimes: [], statusCode: 503 };
        }

        if (statusCode === 404) {
          // No data available for this month
          return { crimes: [], statusCode: 404 };
        }

        if (attempt < this.maxRetries - 1) {
          await this.delay(this.retryDelays[attempt]);
          continue;
        }

        this.logger.error(`API error ${dateStr}: ${statusCode || 'unknown'} - ${error.message}`);
        return { crimes: [], statusCode: statusCode || 500 };
      }
    }

    return { crimes: [], statusCode: 500 };
  }

  /**
   * Split a polygon into 4 quadrants
   */
  splitPolygon(polygon: Coordinate[]): Coordinate[][] {
    // Calculate bounding box
    const lats = polygon.map(([lat]) => lat);
    const lngs = polygon.map(([, lng]) => lng);

    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);

    const midLat = (minLat + maxLat) / 2;
    const midLng = (minLng + maxLng) / 2;

    // Create 4 quadrants
    const quadrants: Coordinate[][] = [
      // Bottom-left
      [
        [minLat, minLng],
        [midLat, minLng],
        [midLat, midLng],
        [minLat, midLng],
      ],
      // Bottom-right
      [
        [minLat, midLng],
        [midLat, midLng],
        [midLat, maxLng],
        [minLat, maxLng],
      ],
      // Top-left
      [
        [midLat, minLng],
        [maxLat, minLng],
        [maxLat, midLng],
        [midLat, midLng],
      ],
      // Top-right
      [
        [midLat, midLng],
        [maxLat, midLng],
        [maxLat, maxLng],
        [midLat, maxLng],
      ],
    ];

    return quadrants;
  }

  /**
   * Get crimes, recursively splitting polygon if needed
   */
  async getCrimesWithSplit(
    polygon: Coordinate[],
    month: Date,
    maxDepth: number = 4,
    currentDepth: number = 0,
  ): Promise<PoliceAPICrime[]> {
    if (currentDepth >= maxDepth) {
      this.logger.warn(
        `Max recursion depth ${maxDepth} reached. Some crimes may be missing.`,
      );
      return [];
    }

    const { crimes, statusCode } = await this.getCrimesStreet(
      polygon,
      month,
    );

    if (statusCode === 503) {
      // Too many crimes - split and recurse
      this.logger.log(`Splitting polygon (depth ${currentDepth + 1})`);
      const quadrants = this.splitPolygon(polygon);

      const allCrimes: PoliceAPICrime[] = [];
      for (const quadrant of quadrants) {
        const quadrantCrimes = await this.getCrimesWithSplit(
          quadrant,
          month,
          maxDepth,
          currentDepth + 1,
        );
        allCrimes.push(...quadrantCrimes);
      }

      return allCrimes;
    }

    return crimes;
  }

  /**
   * Normalize crime data from API response
   */
  normalizeCrime(crimeData: PoliceAPICrime): NormalizedCrime {
    const location = crimeData.location || {};
    const street = location.street || {};
    const outcomeStatus = crimeData.outcome_status || {};

    return {
      externalId: crimeData.id,
      month: crimeData.month,
      category: crimeData.category,
      crimeType: crimeData.location_type || '',
      context: crimeData.context || '',
      persistentId: crimeData.persistent_id,
      latitude: parseFloat(String(location.latitude || 0)) || 0,
      longitude: parseFloat(String(location.longitude || 0)) || 0,
      streetName: street.name || '',
      outcomeStatus: outcomeStatus.category,
    };
  }

  /**
   * Helper method to delay execution
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
