import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { Repository } from 'typeorm';
import { SafetyCell } from '../src/modules/crime/entities/safety-cell.entity';
import { InjectRepository } from '@nestjs/typeorm';

async function bootstrap() {
  console.log('Initializing NestJS application...');
  const app = await NestFactory.createApplicationContext(AppModule);

  const safetyCellRepository = app.get('SafetyCellRepository');

  console.log('\nClearing all H3 safety cells from database...');

  try {
    const result = await safetyCellRepository.query('DELETE FROM safety_cells');
    console.log(`✓ Deleted all safety cells from database`);
  } catch (error) {
    console.error('✗ Error clearing safety cells:', error.message);
    process.exit(1);
  }

  console.log('\nDatabase cleared successfully!');
  await app.close();
}

bootstrap();
