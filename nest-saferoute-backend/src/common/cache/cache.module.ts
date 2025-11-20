import { Module, Global } from '@nestjs/common';
import { CacheModule as NestCacheModule } from '@nestjs/cache-manager';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { redisStore } from 'cache-manager-ioredis-yet';

@Global()
@Module({
  imports: [
    NestCacheModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        // Read directly from process.env as fallback
        const password = configService.get('redis.password') || process.env.REDIS_PASSWORD;
        const redisConfig: any = {
          host: configService.get('redis.host') || process.env.REDIS_HOST || 'localhost',
          port: configService.get('redis.port') || parseInt(process.env.REDIS_PORT || '6379', 10),
          db: configService.get('redis.db') || parseInt(process.env.REDIS_DB || '0', 10),
          ttl: 3600 * 1000, // 1 hour in milliseconds
        };
        if (password) {
          redisConfig.password = password;
        }
        console.log('[Cache] Redis connection config:', { ...redisConfig, password: password ? '***' : 'none' });
        return {
          store: await redisStore(redisConfig),
        };
      },
      inject: [ConfigService],
      isGlobal: true,
    }),
  ],
  exports: [NestCacheModule],
})
export class CacheModule {}
