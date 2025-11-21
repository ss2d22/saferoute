import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { CrimeIncident } from '../entities/crime-incident.entity';
import { CrimeCategory } from '../entities/crime-category.entity';
import { PoliceAPIService } from '../services/police-api.service';
import { CrimeIngestionJobData } from '../services/crime-ingestion.service';

@Processor('crime-ingestion', {
  concurrency: 5, // Process 5 jobs concurrently for conservative rate limiting
  limiter: {
    max: 200, // Max 200 jobs per 30s = 6.67 jobs/s (well under 15 req/s limit)
    duration: 30000, // 30 seconds
  },
})
export class CrimeIngestionProcessor extends WorkerHost {
  private readonly logger = new Logger(CrimeIngestionProcessor.name);
  private processedCount = 0;
  private totalCrimes = 0;

  constructor(
    private policeAPIService: PoliceAPIService,
    @InjectRepository(CrimeIncident)
    private crimeRepository: Repository<CrimeIncident>,
    @InjectRepository(CrimeCategory)
    private categoryRepository: Repository<CrimeCategory>,
  ) {
    super();
    this.logger.log('CrimeIngestionProcessor ready (concurrency: 5, rate: 6.67 jobs/s)');
  }

  async process(job: Job<CrimeIngestionJobData>): Promise<any> {
    // Declare variables outside try block for catch block access
    const { month, category, polygon } = job.data;
    const monthDate = new Date(month);

    try {
      // Fetch crimes from Police API with automatic splitting if needed
      const crimes = await this.policeAPIService.getCrimesWithSplit(
        polygon,
        monthDate,
        5, // Max depth for polygon splitting (increased for high-density areas like London)
      );

      if (crimes.length === 0) {
        return { crimesIngested: 0 };
      }

      // Get all category IDs from crimes
      const categoryIds = [
        ...new Set(crimes.map((c) => c.category).filter(Boolean)),
      ];

      // Fetch categories from database
      const categories = await this.categoryRepository.find({
        where: { id: In(categoryIds as string[]) },
      });

      const categoryMap = new Map(
        categories.map((cat) => [cat.id, cat.id]),
      );

      // Batch insert crimes
      const crimeData: any[] = [];

      for (const crime of crimes) {
        const normalized = this.policeAPIService.normalizeCrime(crime);
        const categoryId = normalized.category;

        if (!categoryId || !categoryMap.has(categoryId)) {
          continue;
        }

        // Convert month string (YYYY-MM) to Date object
        const monthDate = new Date(normalized.month + '-01');

        crimeData.push({
          externalId: normalized.externalId,
          month: monthDate,
          categoryId,
          crimeType: normalized.crimeType,
          latitude: normalized.latitude,
          longitude: normalized.longitude,
          locationDesc: normalized.streetName || 'Unknown location',
          context: normalized.context,
          persistentId: normalized.persistentId,
          forceId: 'hampshire',
          lsoaCode: null,
        });
      }

      // Use raw query with PostGIS function for geometry
      if (crimeData.length > 0) {
        const escapeString = (str: string | null | undefined): string => {
          if (!str) return 'NULL';
          return `'${String(str).replace(/'/g, "''")}'`;
        };

        const values = crimeData.map((crime) => {
          return `(
            ${escapeString(crime.externalId)},
            '${crime.month.toISOString().split('T')[0]}',
            '${crime.categoryId}',
            ${escapeString(crime.crimeType)},
            ${escapeString(crime.context)},
            ${escapeString(crime.persistentId)},
            ${crime.lsoaCode ? `'${crime.lsoaCode}'` : 'NULL'},
            '${crime.forceId}',
            ${escapeString(crime.locationDesc)},
            ST_SetSRID(ST_MakePoint(${crime.longitude}, ${crime.latitude}), 4326),
            ${crime.latitude},
            ${crime.longitude}
          )`;
        }).join(',');

        try {
          await this.crimeRepository.query(`
            INSERT INTO crime_incidents (
              "externalId", month, "categoryId", "crimeType", context, "persistentId",
              "lsoaCode", "forceId", "locationDesc", geom, latitude, longitude
            ) VALUES ${values}
          `);
        } catch (error) {
          // Silently ignore duplicate errors
          if (!error.message.includes('duplicate key')) {
            throw error;
          }
        }
      }

      // Track progress
      this.processedCount++;
      this.totalCrimes += crimeData.length;

      // Log progress every 10 jobs
      if (this.processedCount % 10 === 0) {
        this.logger.log(`Progress: ${this.processedCount} cells processed, ${this.totalCrimes} crimes ingested`);
      }

      return {
        crimesIngested: crimeData.length,
        month: monthDate.toISOString().substring(0, 7),
      };
    } catch (error: any) {
      this.logger.error(
        `Error: ${monthDate.toISOString().substring(0, 7)} - ${error.message}`,
      );
      throw error; // This will trigger retry logic
    }
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    // Silent - only log progress every N jobs in process()
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    const { month } = job.data;
    const monthDate = new Date(month);
    this.logger.error(`FAILED: ${monthDate.toISOString().substring(0, 7)} after ${job.attemptsMade} attempts - ${error.message}`);
  }

  @OnWorkerEvent('active')
  onActive(job: Job) {
    // Silent - reduce log noise
  }
}
