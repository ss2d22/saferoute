import { AppDataSource } from './data-source';

async function runMigrations() {
  try {
    console.log('Initializing database connection...');
    await AppDataSource.initialize();

    console.log('Running pending migrations...');
    const migrations = await AppDataSource.runMigrations();

    if (migrations.length === 0) {
      console.log('No pending migrations.');
    } else {
      console.log(`Successfully ran ${migrations.length} migration(s):`);
      migrations.forEach(migration => {
        console.log(`  - ${migration.name}`);
      });
    }

    await AppDataSource.destroy();
    console.log('Migration complete.');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

runMigrations();
