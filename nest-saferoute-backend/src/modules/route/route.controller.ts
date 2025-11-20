import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { RouteSafetyService } from './services/route-safety.service';
import { RouteHistoryService } from './services/route-history.service';
import { SafeRouteRequestDto } from './dto/safe-route-request.dto';
import { SafeRouteResponseDto } from './dto/route-response.dto';
import {
  RouteHistoryQueryDto,
  RouteHistoryResponseDto,
} from './dto/route-history.dto';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('routes')
@Controller('routes')
export class RouteController {
  constructor(
    private routeSafetyService: RouteSafetyService,
    private routeHistoryService: RouteHistoryService,
  ) {}

  @Post('safe')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({
    summary: 'Get safety-scored route alternatives',
    description:
      'Returns multiple route options ranked by safety score. ' +
      'Authentication is optional - authenticated users get route history saved.',
  })
  @ApiResponse({
    status: 200,
    description: 'Route alternatives with safety scores',
    type: SafeRouteResponseDto,
  })
  @ApiBearerAuth()
  async getSafeRoutes(
    @Body() request: SafeRouteRequestDto,
    @Request() req: any,
  ): Promise<SafeRouteResponseDto> {
    const userId = req.user?.id;
    return this.routeSafetyService.getSafeRoutes(request, userId);
  }

  @Get('history')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get route history for current user' })
  @ApiResponse({
    status: 200,
    description: 'Route history',
    type: RouteHistoryResponseDto,
  })
  async getHistory(
    @Request() req: any,
    @Query() query: RouteHistoryQueryDto,
  ): Promise<RouteHistoryResponseDto> {
    return this.routeHistoryService.getHistory(
      req.user.id,
      query.limit,
      query.offset,
    );
  }

  @Delete('history/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a single history item' })
  @ApiResponse({ status: 200, description: 'History item deleted' })
  async deleteHistoryItem(
    @Request() req: any,
    @Param('id') id: string,
  ): Promise<{ message: string }> {
    await this.routeHistoryService.deleteHistoryItem(req.user.id, id);
    return { message: 'History item deleted' };
  }

  @Delete('history')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete all route history for current user' })
  @ApiResponse({ status: 200, description: 'All history deleted' })
  async deleteAllHistory(
    @Request() req: any,
  ): Promise<{ deletedCount: number }> {
    return this.routeHistoryService.deleteAllHistory(req.user.id);
  }
}
