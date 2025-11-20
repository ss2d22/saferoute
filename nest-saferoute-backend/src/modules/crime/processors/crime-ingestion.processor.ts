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
  concurrency: 10, // Process 10 jobs concurrently
  limiter: {
    max: 300, // Max 300 jobs per duration (allows 10 req/s average with burst capacity)
    duration: 30000, // 30 seconds (Police API allows 15 req/s with burst of 30)
  },
})
export class CrimeIngestionProcessor extends WorkerHost {
  private readonly logger = new Logger(CrimeIngestionProcessor.name);

  constructor(
    private policeAPIService: PoliceAPIService,
    @InjectRepository(CrimeIncident)
    private crimeRepository: Repository<CrimeIncident>,
    @InjectRepository(CrimeCategory)
    private categoryRepository: Repository<CrimeCategory>,
  ) {
    super();
    this.logger.log('CrimeIngestionProcessor instantiated successfully');
    this.logger.log(`Processor configured with concurrency: 10, rate limit: 300 jobs/30s`);
  }

  async process(job: Job<CrimeIngestionJobData>): Promise<any> {
    this.logger.log(`Starting to process job ${job.id}`);

    try {
      const { month, category, polygon } = job.data;
      this.logger.log(`Job ${job.id} data extracted: month=${month}, category=${category}, polygon points=${polygon?.length || 0}`);

      // BullMQ serializes Date objects to ISO strings in Redis
      const monthDate = new Date(month);

      this.logger.log(
        `Processing job ${job.id}: ${monthDate.toISOString().substring(0, 7)} for cell`,
      );
      // Fetch crimes from Police API with automatic splitting if needed
      const crimes = await this.policeAPIService.getCrimesWithSplit(
        polygon,
        monthDate,
        3, // Max depth for polygon splitting
      );

      this.logger.log(
        `Fetched ${crimes.length} crimes for ${monthDate.toISOString().substring(0, 7)}`,
      );

      if (crimes.length === 0) {
        this.logger.warn(
          `Job ${job.id}: No crimes returned from Police API for ${monthDate.toISOString().substring(0, 7)}`,
        );
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
          this.logger.warn(
            `Unknown category: ${normalized.category}, skipping crime`,
          );
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

        this.logger.log(
          `Ingested ${crimeData.length} crimes for ${monthDate.toISOString().substring(0, 7)}`,
        );
      }

      return {
        crimesIngested: crimeData.length,
        month: monthDate.toISOString().substring(0, 7),
      };
    } catch (error: any) {
      this.logger.error(
        `Error processing job ${job.id} for month ${monthDate.toISOString().substring(0, 7)}`,
      );
      this.logger.error(`Error message: ${error.message}`);
      this.logger.error(`Error details:`, {
        month: monthDate.toISOString().substring(0, 7),
        category,
        polygonPoints: polygon.length,
        errorCode: error.code,
        errorResponse: error.response?.data,
        errorStatus: error.response?.status,
      });
      this.logger.error(`Stack trace: ${error.stack}`);
      throw error; // This will trigger retry logic
    }
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    this.logger.debug(`Job ${job.id} completed successfully`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    const { month, category, polygon } = job.data;
    const monthDate = new Date(month);

    this.logger.error(`Job ${job.id} FAILED`);
    this.logger.error(`Job details:`, {
      month: monthDate.toISOString().substring(0, 7),
      category,
      polygonPoints: polygon?.length || 0,
      attemptsMade: job.attemptsMade,
      failedReason: error.message,
      errorName: error.name,
    });
    this.logger.error(`Full error: ${error.stack || error.message}`);
  }

  @OnWorkerEvent('active')
  onActive(job: Job) {
    const { month } = job.data;
    const monthDate = new Date(month);
    this.logger.log(`Job ${job.id} is now ACTIVE - processing ${monthDate.toISOString().substring(0, 7)}`);
  }
}
