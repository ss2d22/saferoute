import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CrimeIncident } from '../entities/crime-incident.entity';

@Injectable()
export class CrimeRepository {
  constructor(
    @InjectRepository(CrimeIncident)
    private repository: Repository<CrimeIncident>,
  ) {}

  /**
   * Find crimes within a polygon (WKT format) for a given time period
   */
  async findCrimesInPolygon(
    polygonWKT: string,
    monthsAgo: number,
  ): Promise<CrimeIncident[]> {
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - monthsAgo);

    return this.repository
      .createQueryBuilder('crime')
      .where('ST_Within(crime.geom, ST_GeomFromText(:polygon, 4326))', {
        polygon: polygonWKT,
      })
      .andWhere('crime.month >= :cutoffDate', { cutoffDate })
      .leftJoinAndSelect('crime.category', 'category')
      .getMany();
  }

  /**
   * Find crimes along a route buffer
   */
  async findCrimesAlongRoute(
    routeBufferWKT: string,
    monthsAgo: number,
  ): Promise<CrimeIncident[]> {
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - monthsAgo);

    return this.repository
      .createQueryBuilder('crime')
      .where('ST_Intersects(crime.geom, ST_GeomFromText(:buffer, 4326))', {
        buffer: routeBufferWKT,
      })
      .andWhere('crime.month >= :cutoffDate', { cutoffDate })
      .leftJoinAndSelect('crime.category', 'category')
      .getMany();
  }

  /**
   * Count crimes by category within an area
   */
  async countCrimesByCategory(
    polygonWKT: string,
    monthsAgo: number,
  ): Promise<{ categoryId: string; count: number }[]> {
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - monthsAgo);

    const results = await this.repository
      .createQueryBuilder('crime')
      .select('crime.categoryId', 'categoryId')
      .addSelect('COUNT(*)', 'count')
      .where('ST_Within(crime.geom, ST_GeomFromText(:polygon, 4326))', {
        polygon: polygonWKT,
      })
      .andWhere('crime.month >= :cutoffDate', { cutoffDate })
      .groupBy('crime.categoryId')
      .getRawMany();

    return results.map((r) => ({
      categoryId: r.categoryId,
      count: parseInt(r.count, 10),
    }));
  }

  /**
   * Get crime statistics for a bounding box
   */
  async getCrimeStatsForBBox(
    minLng: number,
    minLat: number,
    maxLng: number,
    maxLat: number,
    monthsAgo: number,
  ): Promise<CrimeIncident[]> {
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - monthsAgo);

    return this.repository
      .createQueryBuilder('crime')
      .where(
        'crime.latitude BETWEEN :minLat AND :maxLat AND crime.longitude BETWEEN :minLng AND :maxLng',
        { minLat, maxLat, minLng, maxLng },
      )
      .andWhere('crime.month >= :cutoffDate', { cutoffDate })
      .leftJoinAndSelect('crime.category', 'category')
      .getMany();
  }

  /**
   * Batch query: Find all crimes along entire route buffer (optimized)
   * This reduces N queries (one per segment) to 1 query
   */
  async findCrimesAlongRouteBatch(
    routeBufferWKT: string,
    monthsAgo: number,
  ): Promise<CrimeIncident[]> {
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - monthsAgo);

    // Use spatial index with ST_Intersects - GIST index should optimize this
    return this.repository
      .createQueryBuilder('crime')
      .where('ST_Intersects(crime.geom, ST_GeomFromText(:buffer, 4326))', {
        buffer: routeBufferWKT,
      })
      .andWhere('crime.month >= :cutoffDate', { cutoffDate })
      .leftJoinAndSelect('crime.category', 'category')
      .cache(`crimes_route_${routeBufferWKT.substring(0, 50)}_${monthsAgo}`, 300000) // 5 min cache
      .getMany();
  }
}
