import { Client } from 'pg';

async function dropSchema() {
  const client = new Client({
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT || '5432', 10),
    user: process.env.DATABASE_USERNAME || 'saferoute',
    password: process.env.DATABASE_PASSWORD || process.env.POSTGRES_PASSWORD || 'changeme',
    database: process.env.DATABASE_NAME || 'saferoute',
  });

  try {
    console.log('Connecting to database...');
    await client.connect();

    console.log('Dropping all tables...');
    await client.query('DROP SCHEMA public CASCADE');
    await client.query('CREATE SCHEMA public');
    await client.query('GRANT ALL ON SCHEMA public TO public');
    await client.query('CREATE EXTENSION IF NOT EXISTS postgis');
    await client.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

    console.log('Schema dropped and recreated successfully');
    await client.end();
    process.exit(0);
  } catch (error) {
    console.error('Failed to drop schema:', error);
    process.exit(1);
  }
}

dropSchema();
