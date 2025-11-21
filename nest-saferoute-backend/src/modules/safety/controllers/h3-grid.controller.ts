import {
  Controller,
  Get,
  Post,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { H3GridService } from '../services/h3-grid.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import * as h3 from 'h3-js';

@ApiTags('H3 Grids')
@Controller('h3-grids')
export class H3GridController {
  constructor(
    private h3GridService: H3GridService,
    private configService: ConfigService,
  ) {}

  @Get('cells')
  @ApiOperation({ summary: 'Get H3 cells for a bounding box' })
  @ApiQuery({ name: 'minLat', required: true, type: Number })
  @ApiQuery({ name: 'minLng', required: true, type: Number })
  @ApiQuery({ name: 'maxLat', required: true, type: Number })
  @ApiQuery({ name: 'maxLng', required: true, type: Number })
  @ApiQuery({ name: 'month', required: false, type: String })
  async getCells(
    @Query('minLat') minLat: string,
    @Query('minLng') minLng: string,
    @Query('maxLat') maxLat: string,
    @Query('maxLng') maxLng: string,
    @Query('month') month?: string,
  ) {
    const monthDate = month ? new Date(month + '-01') : undefined;

    const cells = await this.h3GridService.getH3CellsForBBox(
      parseFloat(minLat),
      parseFloat(minLng),
      parseFloat(maxLat),
      parseFloat(maxLng),
      monthDate,
    );

    return {
      cells: cells.map(cell => {
        const boundary = h3.cellToBoundary(cell.cellId, true); // true for GeoJSON format [lng, lat]
        const coordinates = [...boundary, boundary[0]]; // Close the polygon

        return {
          cellId: cell.cellId,
          month: cell.month,
          crimeCount: cell.crimeCountTotal,
          crimeCountWeighted: cell.crimeCountWeighted,
          stats: cell.stats,
          geometry: {
            type: 'Polygon',
            coordinates: [coordinates],
          },
        };
      }),
      count: cells.length,
    };
  }

  @Get('safety-score')
  @ApiOperation({ summary: 'Get safety score at a specific location' })
  @ApiQuery({ name: 'lat', required: true, type: Number })
  @ApiQuery({ name: 'lng', required: true, type: Number })
  @ApiQuery({ name: 'resolution', required: false, type: Number, example: 10 })
  @ApiQuery({ name: 'month', required: false, type: String })
  async getSafetyScore(
    @Query('lat') lat: string,
    @Query('lng') lng: string,
    @Query('resolution') resolution?: string,
    @Query('month') month?: string,
  ) {
    const res = resolution ? parseInt(resolution) : 10;
    const monthDate = month ? new Date(month + '-01') : undefined;

    const score = await this.h3GridService.getSafetyScoreAtLocation(
      parseFloat(lat),
      parseFloat(lng),
      res,
      monthDate,
    );

    return score || { message: 'No data available for this location' };
  }

  @Post('populate')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Populate H3 grids for a month (admin only)' })
  @ApiQuery({ name: 'month', required: true, type: String, example: '2024-06' })
  @ApiQuery({ name: 'lookbackMonths', required: false, type: Number, example: 12 })
  @ApiQuery({ name: 'resolution', required: false, type: Number, example: 10 })
  async populateGrids(
    @Query('month') month: string,
    @Query('lookbackMonths') lookbackMonths?: string,
    @Query('resolution') resolution?: string,
  ) {
    const monthDate = new Date(month + '-01');
    const lookback = lookbackMonths ? parseInt(lookbackMonths) : 12;
    const res = resolution ? parseInt(resolution) : 10;

    const result = await this.h3GridService.populateH3GridForMonth(
      monthDate,
      lookback,
      res,
    );

    return {
      message: 'H3 grid population started',
      month: monthDate.toISOString(),
      ...result,
    };
  }

  @Get('southampton')
  @ApiOperation({ summary: 'Get all H3 cells for configured coverage area' })
  @ApiQuery({ name: 'month', required: false, type: String })
  async getSouthamptonCells(@Query('month') month?: string) {
    const monthDate = month ? new Date(month + '-01') : undefined;

    // Get bounding box from environment configuration
    const bboxStr = this.configService.get<string>('grid.southamptonBbox') || '50.85,-1.55,51.0,-1.3';
    const [minLat, minLng, maxLat, maxLng] = bboxStr.split(',').map(parseFloat);

    const cells = await this.h3GridService.getH3CellsForBBox(
      minLat,
      minLng,
      maxLat,
      maxLng,
      monthDate,
    );

    return {
      cells: cells.map(cell => {
        const boundary = h3.cellToBoundary(cell.cellId, true); // true for GeoJSON format [lng, lat]
        const coordinates = [...boundary, boundary[0]]; // Close the polygon

        return {
          cellId: cell.cellId,
          month: cell.month,
          crimeCount: cell.crimeCountTotal,
          crimeCountWeighted: cell.crimeCountWeighted,
          stats: cell.stats,
          geometry: {
            type: 'Polygon',
            coordinates: [coordinates],
          },
        };
      }),
      count: cells.length,
      bbox: { minLat, maxLat, minLng, maxLng },
    };
  }
}
