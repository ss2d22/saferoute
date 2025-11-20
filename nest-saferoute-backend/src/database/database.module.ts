import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DatabaseSeedService } from './database-seed.service';
import { CrimeCategory } from '../modules/crime/entities/crime-category.entity';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get('database.host'),
        port: configService.get('database.port'),
        username: configService.get('database.username'),
        password: configService.get('database.password'),
        database: configService.get('database.name'),
        entities: [__dirname + '/../**/*.entity{.ts,.js}'],
        synchronize: true,
        logging: configService.get('node_env') === 'development',
        autoLoadEntities: true,
        // PostGIS support
        extra: {
          // Enable PostGIS extension
          options: '-c search_path=public',
        },
      }),
      inject: [ConfigService],
    }),
    TypeOrmModule.forFeature([CrimeCategory]),
  ],
  providers: [DatabaseSeedService],
})
export class DatabaseModule {}
