import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { BullModule } from '@nestjs/bullmq';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import configuration from './config/configuration';
import { DatabaseModule } from './database/database.module';
import { CacheModule } from './common/cache/cache.module';
import { AuthModule } from './modules/auth/auth.module';
import { UserModule } from './modules/user/user.module';
import { RouteModule } from './modules/route/route.module';
import { SafetyModule } from './modules/safety/safety.module';
import { CrimeModule } from './modules/crime/crime.module';
import { CrimeIngestionModule } from './modules/crime/crime-ingestion.module';
import { AdminModule } from './modules/admin/admin.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: ['.env.local', '.env'],
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => [
        {
          ttl: 60000, // 1 minute
          limit: configService.get('rateLimit.perMinute') || 60,
        },
      ],
      inject: [ConfigService],
    }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        // Read directly from process.env as fallback
        const password = configService.get('redis.password') || process.env.REDIS_PASSWORD;
        const config: any = {
          host: configService.get('redis.host') || process.env.REDIS_HOST || 'localhost',
          port: configService.get('redis.port') || parseInt(process.env.REDIS_PORT || '6379', 10),
        };
        if (password) {
          config.password = password;
        }
        console.log('[BullMQ] Redis connection config:', { ...config, password: password ? '***' : 'none' });
        return { connection: config };
      },
      inject: [ConfigService],
    }),
    DatabaseModule,
    CacheModule,
    AuthModule,
    UserModule,
    RouteModule,
    SafetyModule,
    CrimeModule,
    CrimeIngestionModule,
    AdminModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
