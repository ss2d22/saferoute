import { Module, Global, Logger } from '@nestjs/common';
import { CacheModule as NestCacheModule } from '@nestjs/cache-manager';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { redisStore } from 'cache-manager-ioredis-yet';

@Global()
@Module({
  imports: [
    NestCacheModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        const logger = new Logger('CacheModule');
        // Read directly from process.env - don't trust ConfigService
        const password = process.env.REDIS_PASSWORD;
        const host = process.env.REDIS_HOST || 'localhost';
        const port = parseInt(process.env.REDIS_PORT || '6379', 10);
        const db = parseInt(process.env.REDIS_DB || '0', 10);

        logger.log(`Redis config - host: ${host}, port: ${port}, db: ${db}, password: ${password ? '***SET***' : 'MISSING'}`);
        logger.log(`ENV check: REDIS_PASSWORD=${process.env.REDIS_PASSWORD ? 'EXISTS' : 'UNDEFINED'}`);

        const redisConfig: any = {
          host,
          port,
          db,
          ttl: 3600 * 1000,
        };

        if (password) {
          redisConfig.password = password;
          logger.log('Password added to Cache connection config');
        } else {
          logger.error('NO PASSWORD - Cache Redis will fail to authenticate!');
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
