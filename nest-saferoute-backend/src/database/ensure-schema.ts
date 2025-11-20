import { AppDataSource } from './data-source';

async function ensureSchema() {
  try {
    console.log('Ensuring database schema is up to date...');
    await AppDataSource.initialize();

    await AppDataSource.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'crime_categories'
          AND column_name = 'harmWeightDefault'
        ) THEN
          ALTER TABLE crime_categories
          ADD COLUMN "harmWeightDefault" float NOT NULL DEFAULT 1.0;
          RAISE NOTICE 'Added harmWeightDefault column to crime_categories';
        ELSE
          RAISE NOTICE 'harmWeightDefault column already exists';
        END IF;
      END $$;
    `);

    await AppDataSource.destroy();
    console.log('Schema check complete.');
  } catch (error) {
    console.log('Schema check skipped (table may not exist yet):', error.message);
  }
}

ensureSchema();
