import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CrimeRepository } from '../../crime/repositories/crime.repository';
import { CrimeIncident } from '../../crime/entities/crime-incident.entity';
import {
  getRecencyWeight,
  calculateMonthsAgo,
  normalizeScore,
  riskToSafetyScore,
} from '../../../common/utils/scoring.utils';
import { getTimeWeight as getCrimeTimeWeight } from '../../../config/crime-weights.config';

export interface SafetyScore {
  safetyScore: number;
  crimeCount: number;
  weightedCrimeCount: number;
  riskScore: number;
}

@Injectable()
export class SafetyScoringService {
  private readonly logger = new Logger(SafetyScoringService.name);

  constructor(
    private crimeRepository: CrimeRepository,
    private configService: ConfigService,
  ) {}

  /**
   * Score a route segment based on crime data within its buffer zone.
   */
  async calculateSafetyScoreForSegment(
    segmentBufferWKT: string,
    lookbackMonths: number,
    timeOfDay?: string,
  ): Promise<SafetyScore> {
    const crimes = await this.crimeRepository.findCrimesAlongRoute(
      segmentBufferWKT,
      lookbackMonths,
    );

    if (crimes.length === 0) {
      return {
        safetyScore: 100,
        crimeCount: 0,
        weightedCrimeCount: 0,
        riskScore: 0,
      };
    }

    const currentDate = new Date();
    let weightedCount = 0;

    for (const crime of crimes) {
      const crimeMonth = crime.month instanceof Date ? crime.month : new Date(crime.month);
      const monthsAgo = calculateMonthsAgo(crimeMonth, currentDate);
      const recencyWeight = getRecencyWeight(monthsAgo);

      let timeWeight = 1.0;
      if (timeOfDay && crime.categoryId) {
        timeWeight = getCrimeTimeWeight(crime.categoryId, timeOfDay);
      }

      const harmWeight = crime.category?.harmWeightDefault || 1.0;
      weightedCount += recencyWeight * timeWeight * harmWeight;
    }

    // Piecewise risk function calibrated to Southampton crime data:
    // Thresholds match percentiles (P15, P50, P75, P90, P95) for balanced visualization
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

    return {
      safetyScore,
      crimeCount: crimes.length,
      weightedCrimeCount: weightedCount,
      riskScore,
    };
  }

  /**
   * Combine multiple segment scores into a single route score,
   * weighted by each segment's length.
   */
  aggregateSafetyScores(
    segmentScores: SafetyScore[],
    segmentLengths: number[],
  ): SafetyScore {
    if (segmentScores.length === 0) {
      return {
        safetyScore: 100,
        crimeCount: 0,
        weightedCrimeCount: 0,
        riskScore: 0,
      };
    }

    const totalLength = segmentLengths.reduce((sum, len) => sum + len, 0);

    let weightedSafetyScore = 0;
    let totalCrimeCount = 0;
    let totalWeightedCrimeCount = 0;
    let weightedRiskScore = 0;

    for (let i = 0; i < segmentScores.length; i++) {
      const lengthWeight = segmentLengths[i] / totalLength;
      weightedSafetyScore += segmentScores[i].safetyScore * lengthWeight;
      totalCrimeCount += segmentScores[i].crimeCount;
      totalWeightedCrimeCount += segmentScores[i].weightedCrimeCount;
      weightedRiskScore += segmentScores[i].riskScore * lengthWeight;
    }

    return {
      safetyScore: weightedSafetyScore,
      crimeCount: totalCrimeCount,
      weightedCrimeCount: totalWeightedCrimeCount,
      riskScore: weightedRiskScore,
    };
  }

  /**
   * Fetch all crimes within a route buffer in a single query.
   */
  async getCrimesForRoute(
    routeBufferWKT: string,
    lookbackMonths: number,
  ): Promise<CrimeIncident[]> {
    return this.crimeRepository.findCrimesAlongRouteBatch(
      routeBufferWKT,
      lookbackMonths,
    );
  }

  /**
   * Score pre-fetched crimes without hitting the database.
   * Used for batch processing of route segments.
   */
  calculateSafetyScoreFromCrimes(
    crimes: CrimeIncident[],
    timeOfDay?: string,
  ): SafetyScore {
    if (crimes.length === 0) {
      return {
        safetyScore: 100,
        crimeCount: 0,
        weightedCrimeCount: 0,
        riskScore: 0,
      };
    }

    const currentDate = new Date();
    let weightedCount = 0;

    for (const crime of crimes) {
      const crimeMonth = crime.month instanceof Date ? crime.month : new Date(crime.month);
      const monthsAgo = calculateMonthsAgo(crimeMonth, currentDate);
      const recencyWeight = getRecencyWeight(monthsAgo);

      let timeWeight = 1.0;
      if (timeOfDay && crime.categoryId) {
        timeWeight = getCrimeTimeWeight(crime.categoryId, timeOfDay);
      }

      const harmWeight = crime.category?.harmWeightDefault || 1.0;
      weightedCount += recencyWeight * timeWeight * harmWeight;
    }

    // Piecewise risk function calibrated to Southampton crime data:
    // Thresholds match percentiles (P15, P50, P75, P90, P95) for balanced visualization
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

    return {
      safetyScore,
      crimeCount: crimes.length,
      weightedCrimeCount: weightedCount,
      riskScore,
    };
  }
}
