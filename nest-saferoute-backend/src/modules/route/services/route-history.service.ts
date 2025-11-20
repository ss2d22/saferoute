import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { RouteHistoryRepository } from '../repositories/route-history.repository';
import {
  RouteHistoryResponseDto,
  RouteHistoryItemDto,
} from '../dto/route-history.dto';

@Injectable()
export class RouteHistoryService {
  private readonly logger = new Logger(RouteHistoryService.name);

  constructor(private routeHistoryRepository: RouteHistoryRepository) {}

  async getHistory(
    userId: string,
    limit: number = 20,
    offset: number = 0,
  ): Promise<RouteHistoryResponseDto> {
    const [history, total] = await this.routeHistoryRepository.findByUserId(
      userId,
      limit,
      offset,
    );

    const items: RouteHistoryItemDto[] = history.map((h) => ({
      id: h.id,
      originLat: h.originLat,
      originLng: h.originLng,
      destinationLat: h.destinationLat,
      destinationLng: h.destinationLng,
      mode: h.mode,
      safetyScoreBest: h.safetyScoreBest,
      distanceMBest: h.distanceMBest,
      durationSBest: h.durationSBest,
      createdAt: h.createdAt,
    }));

    return {
      history: items,
      total,
      limit,
      offset,
    };
  }

  async deleteHistoryItem(userId: string, id: string): Promise<void> {
    const deleted = await this.routeHistoryRepository.deleteById(id, userId);
    if (!deleted) {
      throw new NotFoundException(`History item ${id} not found`);
    }
    this.logger.log(`Deleted history item ${id} for user ${userId}`);
  }

  async deleteAllHistory(userId: string): Promise<{ deletedCount: number }> {
    const deletedCount = await this.routeHistoryRepository.deleteAllByUserId(
      userId,
    );
    this.logger.log(`Deleted ${deletedCount} history items for user ${userId}`);
    return { deletedCount };
  }
}
