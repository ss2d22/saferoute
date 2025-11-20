import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { H3GridService } from '../src/modules/safety/services/h3-grid.service';

async function bootstrap() {
  console.log('Initializing NestJS application...');
  const app = await NestFactory.createApplicationContext(AppModule);

  const h3GridService = app.get(H3GridService);

  // Populate grids for recent months
  const monthsToPopulate = [
    new Date('2024-11-01'),
    new Date('2024-10-01'),
    new Date('2024-09-01'),
    new Date('2024-08-01'),
    new Date('2024-07-01'),
    new Date('2024-06-01'),
  ];

  console.log(`\nPopulating H3 grids for ${monthsToPopulate.length} months...\n`);

  for (const month of monthsToPopulate) {
    console.log(`Processing month: ${month.toISOString().substring(0, 7)}`);
    try {
      const result = await h3GridService.populateH3GridForMonth(
        month,
        12, // lookback 12 months
        11, // resolution 11 (smaller hexagons, ~25m)
      );
      console.log(`  ✓ Processed ${result.processed} cells: ${result.created} created, ${result.updated} updated`);
    } catch (error) {
      console.error(`  ✗ Error processing ${month.toISOString().substring(0, 7)}:`, error.message);
    }
  }

  console.log('\nH3 grid population complete!');
  await app.close();
}

bootstrap();
