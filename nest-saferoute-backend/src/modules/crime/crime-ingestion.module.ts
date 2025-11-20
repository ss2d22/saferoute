import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { CrimeIncident } from './entities/crime-incident.entity';
import { CrimeCategory } from './entities/crime-category.entity';
import { CrimeIngestionService } from './services/crime-ingestion.service';
import { CrimeIngestionProcessor } from './processors/crime-ingestion.processor';
import { CrimeIngestionController } from './crime-ingestion.controller';
import { PoliceAPIService } from './services/police-api.service';
import { CrimeRepository } from './repositories/crime.repository';

@Module({
  imports: [
    HttpModule,
    TypeOrmModule.forFeature([CrimeIncident, CrimeCategory]),
    BullModule.registerQueueAsync({
      name: 'crime-ingestion',
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get('redis.host') || 'localhost',
          port: configService.get('redis.port') || 6379,
        },
        defaultJobOptions: {
          removeOnComplete: 100,
          removeOnFail: 500,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
        },
      }),
    }),
  ],
  controllers: [CrimeIngestionController],
  providers: [
    CrimeIngestionService,
    CrimeIngestionProcessor,
    PoliceAPIService,
    CrimeRepository,
  ],
  exports: [CrimeIngestionService],
})
export class CrimeIngestionModule {}
