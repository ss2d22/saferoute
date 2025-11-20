import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { RouteController } from './route.controller';
import { RouteSafetyService } from './services/route-safety.service';
import { RoutingService } from './services/routing.service';
import { RouteHistoryService } from './services/route-history.service';
import { RouteHistoryRepository } from './repositories/route-history.repository';
import { RouteHistory } from './entities/route-history.entity';
import { SafetyModule } from '../safety/safety.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([RouteHistory]),
    HttpModule,
    SafetyModule,
  ],
  controllers: [RouteController],
  providers: [
    RouteSafetyService,
    RoutingService,
    RouteHistoryService,
    RouteHistoryRepository,
  ],
  exports: [RouteSafetyService, RoutingService, RouteHistoryService],
})
export class RouteModule {}
