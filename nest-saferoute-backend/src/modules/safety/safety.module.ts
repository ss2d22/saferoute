import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { SafetyScoringService } from './services/safety-scoring.service';
import { H3GridService } from './services/h3-grid.service';
import { H3GridController } from './controllers/h3-grid.controller';
import { CrimeRepository } from '../crime/repositories/crime.repository';
import { CrimeIncident } from '../crime/entities/crime-incident.entity';
import { CrimeCategory } from '../crime/entities/crime-category.entity';
import { SafetyCell } from '../crime/entities/safety-cell.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([CrimeIncident, CrimeCategory, SafetyCell]),
    ConfigModule,
  ],
  controllers: [H3GridController],
  providers: [SafetyScoringService, H3GridService, CrimeRepository],
  exports: [SafetyScoringService, H3GridService, CrimeRepository],
})
export class SafetyModule {}
