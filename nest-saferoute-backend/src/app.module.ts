import { Module, Logger } from '@nestjs/common';
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
        const logger = new Logger('BullModule');
        const password = process.env.REDIS_PASSWORD;
        const host = process.env.REDIS_HOST || 'localhost';
        const port = parseInt(process.env.REDIS_PORT || '6379', 10);

        logger.log(`Redis config - host: ${host}, port: ${port}, password: ${password ? '***SET***' : 'MISSING'}`);
        logger.log(`ENV check: REDIS_PASSWORD=${process.env.REDIS_PASSWORD ? 'EXISTS' : 'UNDEFINED'}`);

        const config: any = { host, port };
        if (password) {
          config.password = password;
          logger.log('Password added to BullMQ connection config');
        } else {
          logger.error('NO PASSWORD - BullMQ will fail to authenticate!');
        }

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
