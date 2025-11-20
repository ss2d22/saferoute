import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AdminApiKeyGuard } from '../../common/guards/admin-api-key.guard';
import { CrimeIngestionService } from '../crime/services/crime-ingestion.service';
import { H3GridService } from '../safety/services/h3-grid.service';
import { IngestCrimesDto } from './dto/ingest-crimes.dto';
import { GenerateH3GridDto } from './dto/generate-h3-grid.dto';

@ApiTags('Admin')
@ApiSecurity('admin-api-key')
@ApiBearerAuth()
@Controller('admin')
@UseGuards(AdminApiKeyGuard)
export class AdminController {
  private readonly logger = new Logger(AdminController.name);

  constructor(
    private readonly crimeIngestionService: CrimeIngestionService,
    private readonly h3GridService: H3GridService,
  ) {}

  @Post('ingest-crimes')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Trigger crime data ingestion',
    description:
      'Queues jobs to ingest crime data from UK Police API for the specified date range. ' +
      'Requires admin API key in X-Admin-API-Key header or Authorization: Bearer header.',
  })
  @ApiResponse({
    status: 202,
    description: 'Ingestion jobs queued successfully',
    schema: {
      example: {
        message: 'Crime ingestion started',
        jobIds: ['crime-2024-01-cell-0', 'crime-2024-01-cell-1'],
        jobCount: 192,
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
  async ingestCrimes(@Body() dto: IngestCrimesDto) {
    this.logger.log(`Admin triggered crime ingestion: ${dto.startMonth} to ${dto.endMonth}`);

    const startMonth = new Date(`${dto.startMonth}-01`);
    const endMonth = new Date(`${dto.endMonth}-01`);

    const result = await this.crimeIngestionService.ingestCrimeData(
      startMonth,
      endMonth,
    );

    return {
      message: 'Crime ingestion started',
      jobIds: result.jobIds,
      jobCount: result.jobIds.length,
    };
  }

  @Get('ingestion-progress')
  @ApiOperation({
    summary: 'Get crime ingestion progress',
    description: 'Returns the current status of the crime ingestion queue.',
  })
  @ApiResponse({
    status: 200,
    description: 'Current ingestion progress',
    schema: {
      example: {
        total: 192,
        completed: 150,
        failed: 2,
        pending: 40,
        status: 'running',
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
  async getIngestionProgress() {
    return this.crimeIngestionService.getIngestionProgress();
  }

  @Post('ingestion/pause')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Pause crime ingestion',
    description: 'Pauses the crime ingestion queue.',
  })
  @ApiResponse({ status: 200, description: 'Ingestion paused' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
  async pauseIngestion() {
    await this.crimeIngestionService.pauseIngestion();
    this.logger.log('Admin paused crime ingestion');
    return { message: 'Crime ingestion paused' };
  }

  @Post('ingestion/resume')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Resume crime ingestion',
    description: 'Resumes the crime ingestion queue.',
  })
  @ApiResponse({ status: 200, description: 'Ingestion resumed' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
  async resumeIngestion() {
    await this.crimeIngestionService.resumeIngestion();
    this.logger.log('Admin resumed crime ingestion');
    return { message: 'Crime ingestion resumed' };
  }

  @Post('ingestion/clear')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Clear ingestion queue',
    description: 'Clears all jobs from the crime ingestion queue.',
  })
  @ApiResponse({ status: 200, description: 'Ingestion queue cleared' })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
  async clearIngestion() {
    await this.crimeIngestionService.clearIngestion();
    this.logger.log('Admin cleared crime ingestion queue');
    return { message: 'Crime ingestion queue cleared' };
  }

  @Post('generate-h3-grid')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Generate H3 hexagonal grid cells',
    description:
      'Generates H3 hexagonal grid cells with safety scores for the specified month. ' +
      'This processes crime data and calculates risk scores for each cell.',
  })
  @ApiResponse({
    status: 202,
    description: 'H3 grid generation completed',
    schema: {
      example: {
        message: 'H3 grid generated successfully',
        processed: 1247,
        created: 1247,
        updated: 0,
        month: '2024-09',
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid API key' })
  async generateH3Grid(@Body() dto: GenerateH3GridDto) {
    this.logger.log(`Admin triggered H3 grid generation for ${dto.month}`);

    const month = new Date(`${dto.month}-01`);
    const lookbackMonths = dto.lookbackMonths || 12;
    const resolution = dto.resolution || 10;

    const result = await this.h3GridService.populateH3GridForMonth(
      month,
      lookbackMonths,
      resolution,
    );

    return {
      message: 'H3 grid generated successfully',
      ...result,
      month: dto.month,
    };
  }
}
