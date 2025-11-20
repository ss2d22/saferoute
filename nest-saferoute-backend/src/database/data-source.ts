import { DataSource } from 'typeorm';
import { config } from 'dotenv';

config();

const isProduction = process.env.NODE_ENV === 'production';

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT || '5432', 10),
  username: process.env.DATABASE_USERNAME || 'saferoute',
  password: process.env.DATABASE_PASSWORD || process.env.POSTGRES_PASSWORD || 'changeme',
  database: process.env.DATABASE_NAME || 'saferoute',
  entities: isProduction ? ['dist/src/**/*.entity.js'] : ['src/**/*.entity.ts'],
  migrations: isProduction ? ['dist/src/database/migrations/*.js'] : ['src/database/migrations/*.ts'],
  synchronize: false,
  logging: !isProduction,
});
