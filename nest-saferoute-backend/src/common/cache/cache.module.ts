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
        const password = configService.get('redis.password');
        const redisConfig: any = {
          host: configService.get('redis.host'),
          port: configService.get('redis.port'),
          db: configService.get('redis.db'),
          ttl: 3600 * 1000, // 1 hour in milliseconds
        };
        if (password) {
          redisConfig.password = password;
        }
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
