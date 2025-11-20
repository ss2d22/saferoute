import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CrimeCategory } from '../entities/crime-category.entity';

export interface CrimeIngestionJobData {
  month: Date;
  category: string;
  polygon: [number, number][];
  attempt?: number;
}

export interface IngestionProgress {
  total: number;
  completed: number;
  failed: number;
  pending: number;
  status: 'idle' | 'running' | 'completed' | 'failed';
}

@Injectable()
export class CrimeIngestionService {
  private readonly logger = new Logger(CrimeIngestionService.name);

  // Southampton bounding box with grid subdivisions for efficient API querying
  private readonly SOUTHAMPTON_GRID = this.generateSouthamptonGrid();

  constructor(
    @InjectQueue('crime-ingestion')
    private crimeIngestionQueue: Queue,
    @InjectRepository(CrimeCategory)
    private categoryRepository: Repository<CrimeCategory>,
  ) {}

  /**
   * Generate grid cells for Southampton area to avoid API 503 errors
   */
  private generateSouthamptonGrid(): [number, number][][] {
    // Southampton bounding box (expanded to match Python coverage + extend to Hedge End)
    const minLat = 50.85;  // Extended south to match Python
    const maxLat = 51.00;  // Extended north to match Python
    const minLng = -1.55;  // Extended west to match Python
    const maxLng = -1.25;  // Extended east for Hedge End coverage

    // Divide into 4x4 grid (16 cells) to stay under 10k crimes per query
    const gridSize = 4;
    const latStep = (maxLat - minLat) / gridSize;
    const lngStep = (maxLng - minLng) / gridSize;

    const cells: [number, number][][] = [];

    for (let i = 0; i < gridSize; i++) {
      for (let j = 0; j < gridSize; j++) {
        const cellMinLat = minLat + i * latStep;
        const cellMaxLat = minLat + (i + 1) * latStep;
        const cellMinLng = minLng + j * lngStep;
        const cellMaxLng = minLng + (j + 1) * lngStep;

        cells.push([
          [cellMinLat, cellMinLng],
          [cellMinLat, cellMaxLng],
          [cellMaxLat, cellMaxLng],
          [cellMaxLat, cellMinLng],
          [cellMinLat, cellMinLng], // Close the polygon
        ]);
      }
    }

    return cells;
  }

  /**
   * Ingest crime data for a date range
   */
  async ingestCrimeData(
    startMonth: Date,
    endMonth: Date,
  ): Promise<{ jobIds: string[] }> {
    this.logger.log(
      `Starting crime data ingestion from ${startMonth.toISOString().substring(0, 7)} to ${endMonth.toISOString().substring(0, 7)}`,
    );

    const jobIds: string[] = [];
    const currentMonth = new Date(startMonth);

    while (currentMonth <= endMonth) {
      for (const polygon of this.SOUTHAMPTON_GRID) {
        const job = await this.crimeIngestionQueue.add(
          'ingest-crimes',
          {
            month: new Date(currentMonth),
            category: 'all-crime',
            polygon,
            attempt: 1,
          } as CrimeIngestionJobData,
          {
            jobId: `crime-${currentMonth.toISOString().substring(0, 7)}-cell-${this.SOUTHAMPTON_GRID.indexOf(polygon)}`,
          },
        );

        jobIds.push(job.id || '');
      }

      currentMonth.setMonth(currentMonth.getMonth() + 1);
    }

    this.logger.log(
      `Queued ${jobIds.length} ingestion jobs (${this.SOUTHAMPTON_GRID.length} cells per month)`,
    );

    return { jobIds };
  }

  /**
   * Get ingestion progress
   */
  async getIngestionProgress(): Promise<IngestionProgress> {
    const [completed, failed, delayed, active, waiting] = await Promise.all([
      this.crimeIngestionQueue.getCompletedCount(),
      this.crimeIngestionQueue.getFailedCount(),
      this.crimeIngestionQueue.getDelayedCount(),
      this.crimeIngestionQueue.getActiveCount(),
      this.crimeIngestionQueue.getWaitingCount(),
    ]);

    const pending = delayed + active + waiting;
    const total = completed + failed + pending;

    let status: 'idle' | 'running' | 'completed' | 'failed' = 'idle';
    if (active > 0 || waiting > 0) {
      status = 'running';
    } else if (completed > 0 && pending === 0 && failed === 0) {
      status = 'completed';
    } else if (failed > 0 && pending === 0) {
      status = 'failed';
    }

    return {
      total,
      completed,
      failed,
      pending,
      status,
    };
  }

  /**
   * Pause ingestion
   */
  async pauseIngestion(): Promise<void> {
    await this.crimeIngestionQueue.pause();
    this.logger.log('Crime ingestion paused');
  }

  /**
   * Resume ingestion
   */
  async resumeIngestion(): Promise<void> {
    await this.crimeIngestionQueue.resume();
    this.logger.log('Crime ingestion resumed');
  }

  /**
   * Clear all jobs
   */
  async clearIngestion(): Promise<void> {
    await this.crimeIngestionQueue.drain();
    await this.crimeIngestionQueue.clean(0, 1000, 'completed');
    await this.crimeIngestionQueue.clean(0, 1000, 'failed');
    this.logger.log('Crime ingestion queue cleared');
  }
}
