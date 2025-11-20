import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1737300000000 implements MigrationInterface {
  name = 'InitialSchema1737300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Enable PostGIS extension
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS postgis`);
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    // Create crime_categories table
    await queryRunner.query(`
      CREATE TABLE "crime_categories" (
        "id" varchar(100) PRIMARY KEY,
        "name" varchar(200) NOT NULL,
        "harmWeightDefault" float NOT NULL DEFAULT 1.0,
        "isPersonal" boolean NOT NULL DEFAULT false,
        "isProperty" boolean NOT NULL DEFAULT false,
        "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
        "updatedAt" timestamp with time zone NOT NULL DEFAULT now()
      )
    `);

    // Create crime_incidents table
    await queryRunner.query(`
      CREATE TABLE "crime_incidents" (
        "id" bigserial PRIMARY KEY,
        "externalId" varchar(200),
        "month" date NOT NULL,
        "categoryId" varchar(100) NOT NULL,
        "crimeType" varchar(200) NOT NULL,
        "context" text,
        "persistentId" varchar(200),
        "lsoaCode" varchar(100),
        "forceId" varchar(100) NOT NULL,
        "locationDesc" text NOT NULL,
        "geom" geometry(Point, 4326) NOT NULL,
        "latitude" float,
        "longitude" float,
        "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
        "ingestedAt" timestamp with time zone NOT NULL DEFAULT now(),
        FOREIGN KEY ("categoryId") REFERENCES "crime_categories"("id")
      )
    `);

    // Create indexes for crime_incidents
    await queryRunner.query(`CREATE INDEX "ix_crime_incidents_month_category" ON "crime_incidents" ("month", "categoryId")`);
    await queryRunner.query(`CREATE INDEX "ix_crime_incidents_month_desc" ON "crime_incidents" ("month" DESC)`);
    await queryRunner.query(`CREATE INDEX "ix_crime_incidents_geom" ON "crime_incidents" USING GIST ("geom")`);
    await queryRunner.query(`CREATE INDEX "ix_crime_incidents_category" ON "crime_incidents" ("categoryId")`);
    await queryRunner.query(`CREATE INDEX "ix_crime_incidents_force" ON "crime_incidents" ("forceId")`);

    // Create safety_cells table
    await queryRunner.query(`
      CREATE TABLE "safety_cells" (
        "id" bigserial PRIMARY KEY,
        "cellId" varchar(200) NOT NULL UNIQUE,
        "geom" geometry(Polygon, 4326) NOT NULL,
        "month" date NOT NULL,
        "crimeCountTotal" int NOT NULL DEFAULT 0,
        "crimeCountWeighted" float NOT NULL DEFAULT 0,
        "stats" jsonb NOT NULL DEFAULT '{}',
        "updatedAt" timestamp with time zone NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`CREATE INDEX "ix_safety_cells_month_desc" ON "safety_cells" ("month" DESC)`);
    await queryRunner.query(`CREATE INDEX "ix_safety_cells_geom" ON "safety_cells" USING GIST ("geom")`);
    await queryRunner.query(`CREATE INDEX "ix_safety_cells_cell_id" ON "safety_cells" ("cellId")`);

    // Create ingestion_runs table
    await queryRunner.query(`
      CREATE TABLE "ingestion_runs" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "areaName" varchar(100) NOT NULL,
        "month" date NOT NULL,
        "status" varchar(50) NOT NULL,
        "startedAt" timestamp with time zone NOT NULL DEFAULT now(),
        "finishedAt" timestamp with time zone,
        "errorMessage" text,
        "recordsIngested" int NOT NULL DEFAULT 0,
        "tilesProcessed" int NOT NULL DEFAULT 0,
        "tilesTotal" int NOT NULL DEFAULT 0
      )
    `);

    await queryRunner.query(`CREATE INDEX "ix_ingestion_runs_area_month" ON "ingestion_runs" ("areaName", "month")`);
    await queryRunner.query(`CREATE INDEX "ix_ingestion_runs_status" ON "ingestion_runs" ("status")`);

    // Create users table
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "email" varchar(255) NOT NULL UNIQUE,
        "passwordHash" varchar(255) NOT NULL,
        "isActive" boolean NOT NULL DEFAULT true,
        "isAdmin" boolean NOT NULL DEFAULT false,
        "settings" jsonb DEFAULT '{}',
        "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
        "updatedAt" timestamp with time zone NOT NULL DEFAULT now(),
        "lastLoginAt" timestamp with time zone
      )
    `);

    await queryRunner.query(`CREATE INDEX "ix_users_email" ON "users" ("email")`);

    // Create route_history table
    await queryRunner.query(`
      CREATE TABLE "route_history" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "originLat" float NOT NULL,
        "originLng" float NOT NULL,
        "destinationLat" float NOT NULL,
        "destinationLng" float NOT NULL,
        "mode" varchar(50) NOT NULL,
        "safetyScoreBest" float NOT NULL,
        "distanceMBest" float NOT NULL,
        "durationSBest" float NOT NULL,
        "requestMeta" jsonb DEFAULT '{}',
        "routeGeom" geometry(LineString, 4326),
        "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
        FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`CREATE INDEX "ix_route_history_user_created" ON "route_history" ("userId", "createdAt" DESC)`);
    await queryRunner.query(`CREATE INDEX "ix_route_history_user" ON "route_history" ("userId")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "route_history" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "ingestion_runs" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "safety_cells" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "crime_incidents" CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS "crime_categories" CASCADE`);
  }
}
