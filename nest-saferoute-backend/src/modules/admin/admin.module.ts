import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AdminController } from './admin.controller';
import { CrimeIngestionModule } from '../crime/crime-ingestion.module';
import { SafetyModule } from '../safety/safety.module';
import { AdminApiKeyGuard } from '../../common/guards/admin-api-key.guard';

@Module({
  imports: [ConfigModule, CrimeIngestionModule, SafetyModule],
  controllers: [AdminController],
  providers: [AdminApiKeyGuard],
})
export class AdminModule {}
