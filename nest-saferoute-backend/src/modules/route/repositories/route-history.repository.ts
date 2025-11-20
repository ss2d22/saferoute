import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RouteHistory } from '../entities/route-history.entity';

@Injectable()
export class RouteHistoryRepository {
  constructor(
    @InjectRepository(RouteHistory)
    private repository: Repository<RouteHistory>,
  ) {}

  async createRouteHistory(data: Partial<RouteHistory>): Promise<RouteHistory> {
    const history = this.repository.create(data);
    return this.repository.save(history);
  }

  async findByUserId(
    userId: string,
    limit: number = 50,
    offset: number = 0,
  ): Promise<[RouteHistory[], number]> {
    return this.repository.findAndCount({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });
  }

  async deleteById(id: string, userId: string): Promise<boolean> {
    const result = await this.repository.delete({ id, userId });
    return (result.affected || 0) > 0;
  }

  async deleteAllByUserId(userId: string): Promise<number> {
    const result = await this.repository.delete({ userId });
    return result.affected || 0;
  }

  async countByUserId(userId: string): Promise<number> {
    return this.repository.count({ where: { userId } });
  }
}
