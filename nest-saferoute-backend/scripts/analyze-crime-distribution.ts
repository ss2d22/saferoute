import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';

async function bootstrap() {
  console.log('Connecting to database...');
  const app = await NestFactory.createApplicationContext(AppModule);
  const dataSource = app.get(DataSource);

  // Query 1: Overall statistics
  const statsResult = await dataSource.query(`
    SELECT
      COUNT(*) as total_cells,
      ROUND(AVG("crimeCountTotal")::numeric, 2) as avg_crimes,
      MIN("crimeCountTotal") as min_crimes,
      MAX("crimeCountTotal") as max_crimes,
      ROUND(AVG("crimeCountWeighted")::numeric, 2) as avg_weighted,
      ROUND(MIN("crimeCountWeighted")::numeric, 2) as min_weighted,
      ROUND(MAX("crimeCountWeighted")::numeric, 2) as max_weighted,
      COUNT(CASE WHEN "crimeCountTotal" = 0 THEN 1 END) as zero_crime_cells
    FROM safety_cells
    WHERE month = '2025-09-01'
  `);

  console.log('\n=== Overall Safety Cell Statistics ===');
  console.table(statsResult);

  // Query 2: Distribution by weighted count buckets
  const distributionResult = await dataSource.query(`
    SELECT
      CASE
        WHEN "crimeCountWeighted" = 0 THEN '0'
        WHEN "crimeCountWeighted" < 5 THEN '0-5'
        WHEN "crimeCountWeighted" < 20 THEN '5-20'
        WHEN "crimeCountWeighted" < 50 THEN '20-50'
        WHEN "crimeCountWeighted" < 100 THEN '50-100'
        WHEN "crimeCountWeighted" < 200 THEN '100-200'
        ELSE '200+'
      END as weighted_range,
      COUNT(*) as cell_count,
      ROUND(AVG("crimeCountTotal")::numeric, 2) as avg_total_crimes,
      ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) as percentage
    FROM safety_cells
    WHERE month = '2025-09-01'
    GROUP BY weighted_range
    ORDER BY MIN("crimeCountWeighted")
  `);

  console.log('\n=== Distribution by Weighted Crime Count ===');
  console.table(distributionResult);

  // Query 3: Harm weights
  const harmWeightsResult = await dataSource.query(`
    SELECT
      id,
      name,
      "harmWeightDefault"
    FROM crime_categories
    ORDER BY "harmWeightDefault" DESC
  `);

  console.log('\n=== Harm Weights by Category ===');
  console.table(harmWeightsResult);

  await app.close();
}

bootstrap();
