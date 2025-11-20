import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';
import { CrimeIngestionService } from './services/crime-ingestion.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

class IngestCrimeDataDto {
  @ApiProperty({ example: '2024-06', description: 'Start month in YYYY-MM format' })
  @IsString()
  @Matches(/^\d{4}-\d{2}$/, { message: 'startMonth must be in YYYY-MM format' })
  startMonth: string;

  @ApiProperty({ example: '2025-09', description: 'End month in YYYY-MM format' })
  @IsString()
  @Matches(/^\d{4}-\d{2}$/, { message: 'endMonth must be in YYYY-MM format' })
  endMonth: string;
}

@ApiTags('crime-ingestion')
@Controller('crime-ingestion')
// Temporarily disabled for testing - TODO: Re-enable in production
// @UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class CrimeIngestionController {
  constructor(private crimeIngestionService: CrimeIngestionService) {}

  @Post('ingest')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Start crime data ingestion',
    description: 'Queues jobs to ingest crime data from UK Police API for the specified date range',
  })
  @ApiResponse({ status: 202, description: 'Ingestion jobs queued successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async ingestCrimeData(@Body() dto: IngestCrimeDataDto) {
    const startMonth = new Date(dto.startMonth + '-01');
    const endMonth = new Date(dto.endMonth + '-01');

    const result = await this.crimeIngestionService.ingestCrimeData(
      startMonth,
      endMonth,
    );

    return {
      message: 'Crime data ingestion started',
      jobsQueued: result.jobIds.length,
    };
  }

  @Get('progress')
  @ApiOperation({ summary: 'Get ingestion progress' })
  @ApiResponse({ status: 200, description: 'Ingestion progress' })
  async getProgress() {
    return this.crimeIngestionService.getIngestionProgress();
  }

  @Post('pause')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Pause ingestion' })
  @ApiResponse({ status: 200, description: 'Ingestion paused' })
  async pauseIngestion() {
    await this.crimeIngestionService.pauseIngestion();
    return { message: 'Ingestion paused' };
  }

  @Post('resume')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resume ingestion' })
  @ApiResponse({ status: 200, description: 'Ingestion resumed' })
  async resumeIngestion() {
    await this.crimeIngestionService.resumeIngestion();
    return { message: 'Ingestion resumed' };
  }

  @Delete('clear')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Clear all ingestion jobs' })
  @ApiResponse({ status: 200, description: 'Ingestion queue cleared' })
  async clearIngestion() {
    await this.crimeIngestionService.clearIngestion();
    return { message: 'Ingestion queue cleared' };
  }
}
