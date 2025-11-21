import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as h3 from 'h3-js';
import { SafetyCell } from '../../crime/entities/safety-cell.entity';
import { CrimeRepository } from '../../crime/repositories/crime.repository';
import {
  getRecencyWeight,
  calculateMonthsAgo,
  riskToSafetyScore,
} from '../../../common/utils/scoring.utils';
import { getTimeWeight as getCrimeTimeWeight } from '../../../config/crime-weights.config';

export interface H3CellStats {
  cellId: string;
  lat: number;
  lng: number;
  safetyScore: number;
  crimeCount: number;
  crimeCountWeighted: number;
  riskScore: number;
  categoryBreakdown: Record<string, number>;
}

@Injectable()
export class H3GridService {
  private readonly logger = new Logger(H3GridService.name);

  constructor(
    @InjectRepository(SafetyCell)
    private safetyCellRepository: Repository<SafetyCell>,
    private crimeRepository: CrimeRepository,
    private configService: ConfigService,
  ) {}

  generateH3CellsForBBox(
    minLat: number,
    minLng: number,
    maxLat: number,
    maxLng: number,
    resolution: number = 10,
  ): string[] {
    const cells = new Set<string>();

    const latStep = (maxLat - minLat) / 20;
    const lngStep = (maxLng - minLng) / 20;

    for (let lat = minLat; lat <= maxLat; lat += latStep) {
      for (let lng = minLng; lng <= maxLng; lng += lngStep) {
        const cellId = h3.latLngToCell(lat, lng, resolution);
        cells.add(cellId);

        const neighbors = h3.gridDisk(cellId, 1);
        neighbors.forEach(n => cells.add(n));
      }
    }

    return Array.from(cells);
  }

  generateCoverageAreaH3Cells(resolution: number = 10): string[] {
    // Get bounding box from environment configuration
    const bboxStr = this.configService.get<string>('grid.southamptonBbox') || '50.85,-1.55,51.0,-1.3';
    const [minLat, minLng, maxLat, maxLng] = bboxStr.split(',').map(parseFloat);

    return this.generateH3CellsForBBox(minLat, minLng, maxLat, maxLng, resolution);
  }

  async calculateCellSafetyScore(
    cellId: string,
    lookbackMonths: number,
    timeOfDay?: string,
  ): Promise<H3CellStats> {
    const [lat, lng] = h3.cellToLatLng(cellId);
    const boundary = h3.cellToBoundary(cellId, true);

    const polygonCoords = boundary.map(coord => `${coord[0]} ${coord[1]}`).join(', ');
    const polygonWKT = `POLYGON((${polygonCoords}, ${boundary[0][0]} ${boundary[0][1]}))`;

    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - lookbackMonths);

    const crimes = await this.crimeRepository.findCrimesInPolygon(
      polygonWKT,
      lookbackMonths,
    );

    if (crimes.length === 0) {
      return {
        cellId,
        lat,
        lng,
        safetyScore: 100,
        crimeCount: 0,
        crimeCountWeighted: 0,
        riskScore: 0,
        categoryBreakdown: {},
      };
    }

    const currentDate = new Date();
    let weightedCount = 0;
    const categoryBreakdown: Record<string, number> = {};

    for (const crime of crimes) {
      const crimeMonth = crime.month instanceof Date ? crime.month : new Date(crime.month);
      const monthsAgo = calculateMonthsAgo(crimeMonth, currentDate);
      const recencyWeight = getRecencyWeight(monthsAgo);

      let timeWeight = 1.0;
      if (timeOfDay && crime.categoryId) {
        timeWeight = getCrimeTimeWeight(crime.categoryId, timeOfDay);
      }

      const harmWeight = crime.category?.harmWeightDefault || 1.0;
      const crimeWeight = recencyWeight * timeWeight * harmWeight;
      weightedCount += crimeWeight;

      const category = crime.category?.name || 'unknown';
      categoryBreakdown[category] = (categoryBreakdown[category] || 0) + 1;
    }

    let riskScore: number;
    if (weightedCount === 0) {
      riskScore = 0.0;
    } else if (weightedCount < 5) {
      riskScore = 0.04 * weightedCount / 5.0;
    } else if (weightedCount < 20) {
      riskScore = 0.2 + 0.2 * (weightedCount - 5.0) / (20.0 - 5.0);
    } else if (weightedCount < 50) {
      riskScore = 0.4 + 0.2 * (weightedCount - 20.0) / (50.0 - 20.0);
    } else if (weightedCount < 100) {
      riskScore = 0.6 + 0.2 * (weightedCount - 50.0) / (100.0 - 50.0);
    } else if (weightedCount < 200) {
      riskScore = 0.8 + 0.15 * (weightedCount - 100.0) / (200.0 - 100.0);
    } else {
      const excess = Math.min(weightedCount - 200.0, 200.0);
      riskScore = 0.95 + 0.05 * (excess / 200.0);
    }
    riskScore = Math.max(0.0, Math.min(1.0, riskScore));

    const safetyScore = riskToSafetyScore(riskScore);

    return {
      cellId,
      lat,
      lng,
      safetyScore,
      crimeCount: crimes.length,
      crimeCountWeighted: weightedCount,
      riskScore,
      categoryBreakdown,
    };
  }

  async populateH3GridForMonth(
    month: Date,
    lookbackMonths: number = 12,
    resolution: number = 10,
  ): Promise<{ processed: number; created: number; updated: number }> {
    this.logger.log(`Starting crime-driven H3 cell generation for month ${month.toISOString().substring(0, 7)}`);

    const cutoffDate = new Date(month);
    cutoffDate.setMonth(cutoffDate.getMonth() - lookbackMonths);

    // Get bounding box from environment configuration
    const bboxStr = this.configService.get<string>('grid.southamptonBbox') || '50.85,-1.55,51.0,-1.3';
    const [minLat, minLng, maxLat, maxLng] = bboxStr.split(',').map(parseFloat);

    this.logger.log(`Using coverage area: ${bboxStr}`);

    const crimes = await this.crimeRepository.getCrimeStatsForBBox(
      minLng,
      minLat,
      maxLng,
      maxLat,
      lookbackMonths,
    );

    this.logger.log(`Fetched ${crimes.length} crimes for H3 cell generation`);

    if (crimes.length === 0) {
      this.logger.warn('No crimes found for the specified period and area');
      return { processed: 0, created: 0, updated: 0 };
    }

    const h3CellMap = new Map<string, {
      crimes: any[];
      crimeCount: number;
      weightedCount: number;
      categoryBreakdown: Record<string, number>;
    }>();

    const currentDate = new Date();

    for (const crime of crimes) {
      const cellId = h3.latLngToCell(crime.latitude, crime.longitude, resolution);

      if (!h3CellMap.has(cellId)) {
        h3CellMap.set(cellId, {
          crimes: [],
          crimeCount: 0,
          weightedCount: 0,
          categoryBreakdown: {},
        });
      }

      const cellData = h3CellMap.get(cellId)!;
      cellData.crimes.push(crime);
      cellData.crimeCount++;

      const crimeMonth = crime.month instanceof Date ? crime.month : new Date(crime.month);
      const monthsAgo = calculateMonthsAgo(crimeMonth, currentDate);
      const recencyWeight = getRecencyWeight(monthsAgo);
      const harmWeight = crime.category?.harmWeightDefault || 1.0;
      const crimeWeight = recencyWeight * harmWeight;

      cellData.weightedCount += crimeWeight;

      const category = crime.category?.name || 'unknown';
      cellData.categoryBreakdown[category] = (cellData.categoryBreakdown[category] || 0) + 1;
    }

    this.logger.log(`Generated ${h3CellMap.size} unique H3 cells with crimes`);

    let processed = 0;

    for (const [cellId, cellData] of h3CellMap.entries()) {
      const [lat, lng] = h3.cellToLatLng(cellId);
      const boundary = h3.cellToBoundary(cellId, true);

      const polygonCoords = boundary.map(coord => `${coord[0]} ${coord[1]}`).join(', ');
      const polygonWKT = `POLYGON((${polygonCoords}, ${boundary[0][0]} ${boundary[0][1]}))`;

      const weightedCount = cellData.weightedCount;
      let riskScore: number;
      if (weightedCount === 0) {
        riskScore = 0.0;
      } else if (weightedCount < 5) {
        riskScore = 0.15 * (weightedCount / 5.0);
      } else if (weightedCount < 20) {
        riskScore = 0.15 + 0.20 * ((weightedCount - 5.0) / 15.0);
      } else if (weightedCount < 50) {
        riskScore = 0.35 + 0.20 * ((weightedCount - 20.0) / 30.0);
      } else if (weightedCount < 100) {
        riskScore = 0.55 + 0.20 * ((weightedCount - 50.0) / 50.0);
      } else if (weightedCount < 200) {
        riskScore = 0.75 + 0.15 * ((weightedCount - 100.0) / 100.0);
      } else {
        const excess = Math.min(weightedCount - 200.0, 300.0);
        riskScore = 0.90 + 0.10 * (excess / 300.0);
      }
      riskScore = Math.max(0.0, Math.min(1.0, riskScore));

      const safetyScore = riskToSafetyScore(riskScore);

      await this.safetyCellRepository.query(
        `INSERT INTO safety_cells ("cellId", geom, month, "crimeCountTotal", "crimeCountWeighted", stats)
         VALUES ($1, ST_GeomFromText($2, 4326), $3, $4, $5, $6)
         ON CONFLICT ("cellId", month)
         DO UPDATE SET
           "crimeCountTotal" = EXCLUDED."crimeCountTotal",
           "crimeCountWeighted" = EXCLUDED."crimeCountWeighted",
           stats = EXCLUDED.stats,
           geom = EXCLUDED.geom`,
        [
          cellId,
          polygonWKT,
          month,
          cellData.crimeCount,
          cellData.weightedCount,
          JSON.stringify({
            safetyScore,
            riskScore,
            categoryBreakdown: cellData.categoryBreakdown,
            center: { lat, lng },
          }),
        ],
      );

      processed++;
    }

    this.logger.log(`Processed ${processed} cells (all with crimes > 0) for month ${month.toISOString().substring(0, 7)}`);

    return { processed, created: processed, updated: 0 };
  }

  async getH3CellsForBBox(
    minLat: number,
    minLng: number,
    maxLat: number,
    maxLng: number,
    month?: Date,
  ): Promise<SafetyCell[]> {
    const query = this.safetyCellRepository
      .createQueryBuilder('cell')
      .where(
        'ST_Intersects(cell.geom, ST_MakeEnvelope(:minLng, :minLat, :maxLng, :maxLat, 4326))',
        { minLat, maxLat, minLng, maxLng },
      );

    if (month) {
      query.andWhere('cell.month = :month', { month });
    }

    return query.getMany();
  }

  async getSafetyScoreAtLocation(
    lat: number,
    lng: number,
    resolution: number = 10,
    month?: Date,
  ): Promise<H3CellStats | null> {
    const cellId = h3.latLngToCell(lat, lng, resolution);

    const query = this.safetyCellRepository
      .createQueryBuilder('cell')
      .where('cell.cellId = :cellId', { cellId });

    if (month) {
      query.andWhere('cell.month = :month', { month });
    } else {
      query.orderBy('cell.month', 'DESC').limit(1);
    }

    const cell = await query.getOne();

    if (!cell) {
      return null;
    }

    const [cellLat, cellLng] = h3.cellToLatLng(cellId);

    return {
      cellId,
      lat: cellLat,
      lng: cellLng,
      safetyScore: (cell.stats as any)?.safetyScore || 0,
      crimeCount: cell.crimeCountTotal,
      crimeCountWeighted: cell.crimeCountWeighted,
      riskScore: (cell.stats as any)?.riskScore || 0,
      categoryBreakdown: (cell.stats as any)?.categoryBreakdown || {},
    };
  }
}
