import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import { CRIME_CATEGORIES } from './crime-categories.seed';

// Load environment variables
config();

async function runSeed() {
  // Create database connection
  const dataSource = new DataSource({
    type: 'postgres',
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT || '5432', 10),
    username: process.env.DATABASE_USERNAME || 'saferoute',
    password: process.env.DATABASE_PASSWORD || 'changeme',
    database: process.env.DATABASE_NAME || 'saferoute',
  });

  try {
    await dataSource.initialize();
    console.log('=' .repeat(70));
    console.log('Populating Crime Categories');
    console.log('='.repeat(70));
    console.log();

    let inserted = 0;
    let skipped = 0;

    for (const category of CRIME_CATEGORIES) {
      // Check if category already exists
      const existing = await dataSource.query(
        'SELECT id FROM crime_categories WHERE id = $1',
        [category.id],
      );

      if (existing.length > 0) {
        console.log(`⊘ ${category.name} (already exists)`);
        skipped++;
      } else {
        await dataSource.query(
          `INSERT INTO crime_categories (id, name, "harmWeightDefault", "isPersonal", "isProperty", "createdAt", "updatedAt")
           VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
          [
            category.id,
            category.name,
            category.harmWeightDefault,
            category.isPersonal,
            category.isProperty,
          ],
        );
        console.log(
          `✓ ${category.name} (weight: ${category.harmWeightDefault})`,
        );
        inserted++;
      }
    }

    console.log();
    console.log('='.repeat(70));
    console.log('Summary');
    console.log('='.repeat(70));
    console.log(`  ✓ Inserted: ${inserted}`);
    console.log(`  ⊘ Skipped: ${skipped}`);
    console.log(`  Total: ${CRIME_CATEGORIES.length}`);
    console.log();

    await dataSource.destroy();
    process.exit(0);
  } catch (error) {
    console.error(`\n✗ Error: ${error.message}`);
    console.error(error);
    await dataSource.destroy();
    process.exit(1);
  }
}

runSeed();
