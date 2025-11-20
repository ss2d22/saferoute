import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { H3GridService } from '../src/modules/safety/services/h3-grid.service';

async function bootstrap() {
  console.log('Initializing NestJS application...');
  const app = await NestFactory.createApplicationContext(AppModule);

  const h3GridService = app.get(H3GridService);

  const month = new Date('2025-09-01');
  const lookbackMonths = 12;
  const resolution = 10;

  console.log(`\nPopulating H3 grids for ${month.toISOString().substring(0, 7)}`);
  console.log(`Lookback: ${lookbackMonths} months`);
  console.log(`Resolution: ${resolution}\n`);

  try {
    const result = await h3GridService.populateH3GridForMonth(
      month,
      lookbackMonths,
      resolution,
    );
    console.log(`\n✓ Processed ${result.processed} cells: ${result.created} created, ${result.updated} updated`);
  } catch (error) {
    console.error(`✗ Error processing ${month.toISOString().substring(0, 7)}:`, error.message);
    process.exit(1);
  }

  console.log('\nH3 grid population complete!');
  await app.close();
}

bootstrap();
