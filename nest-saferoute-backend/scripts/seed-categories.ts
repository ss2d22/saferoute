import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { CRIME_CATEGORIES } from '../src/database/seeds/crime-categories.seed';

dotenv.config();

async function seedCategories() {
  const dataSource = new DataSource({
    type: 'postgres',
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT || '5432'),
    username: process.env.DATABASE_USERNAME || 'saferoute',
    password: process.env.DATABASE_PASSWORD || 'changeme',
    database: process.env.DATABASE_NAME || 'saferoute',
  });

  try {
    await dataSource.initialize();
    console.log('Connected to database');

    // Insert categories
    for (const category of CRIME_CATEGORIES) {
      await dataSource.query(
        `
        INSERT INTO crime_categories (id, name, "harmWeightDefault", "isPersonal", "isProperty")
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          "harmWeightDefault" = EXCLUDED."harmWeightDefault",
          "isPersonal" = EXCLUDED."isPersonal",
          "isProperty" = EXCLUDED."isProperty",
          "updatedAt" = NOW()
        `,
        [
          category.id,
          category.name,
          category.harmWeightDefault,
          category.isPersonal,
          category.isProperty,
        ],
      );
      console.log(`✓ Seeded category: ${category.name}`);
    }

    console.log(`\nSuccessfully seeded ${CRIME_CATEGORIES.length} crime categories`);
  } catch (error) {
    console.error('Error seeding categories:', error);
    process.exit(1);
  } finally {
    await dataSource.destroy();
  }
}

seedCategories();
