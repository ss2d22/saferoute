import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { CrimeCategory } from './entities/crime-category.entity';
import { CrimeIncident } from './entities/crime-incident.entity';
import { CrimeRepository } from './repositories/crime.repository';
import { PoliceAPIService } from './services/police-api.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([CrimeCategory, CrimeIncident]),
    HttpModule,
  ],
  providers: [CrimeRepository, PoliceAPIService],
  exports: [CrimeRepository, PoliceAPIService],
})
export class CrimeModule {}
