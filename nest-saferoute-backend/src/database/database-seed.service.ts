import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CrimeCategory } from '../modules/crime/entities/crime-category.entity';
import { CRIME_CATEGORIES } from './seeds/crime-categories.seed';

@Injectable()
export class DatabaseSeedService implements OnModuleInit {
  private readonly logger = new Logger(DatabaseSeedService.name);

  constructor(
    @InjectRepository(CrimeCategory)
    private categoryRepository: Repository<CrimeCategory>,
  ) {}

  async onModuleInit() {
    await this.seedCrimeCategories();
  }

  private async seedCrimeCategories() {
    try {
      const existingCount = await this.categoryRepository.count();

      if (existingCount > 0) {
        this.logger.log(`Crime categories already seeded (${existingCount} categories)`);
        return;
      }

      this.logger.log('Seeding crime categories...');

      for (const category of CRIME_CATEGORIES) {
        await this.categoryRepository.save(category);
      }

      this.logger.log(`✓ Successfully seeded ${CRIME_CATEGORIES.length} crime categories`);
    } catch (error) {
      this.logger.error('Failed to seed crime categories:', error);
    }
  }
}
