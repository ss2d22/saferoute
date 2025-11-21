import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  // Enable CORS
  const corsOrigins = configService.get<string[]>('cors.origins');
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Global prefix
  app.setGlobalPrefix('api/v1', {
    exclude: ['health', 'ready', 'metrics'],
  });

  // Swagger documentation
  const config = new DocumentBuilder()
    .setTitle('SafeRoute API')
    .setDescription(
      'SafeRoute finds safer routes across London, Southampton, and South West England by analyzing UK Police crime data. ' +
      '\n\nFeatures: Safety heatmaps with crime risk visualization, multiple route alternatives ranked by safety score, ' +
      'historical crime analytics with time-of-day weighting, Redis caching, and automated monthly data updates.' +
      '\n\nData sources: UK Police API for crime data, OpenRouteService for routing, H3 hexagonal spatial indexing for efficient geographic queries.' +
      '\n\nAuthentication is optional. Authenticated users get route history tracking, custom preferences, and higher rate limits. ' +
      'Use /auth/login to obtain a JWT access token.',
    )
    .setVersion('0.1.0')
    .addBearerAuth()
    .addTag('health', 'Health and readiness checks')
    .addTag('auth', 'Authentication and tokens')
    .addTag('routes', 'Safety-scored route planning')
    .addTag('safety', 'Safety heatmaps and crime statistics')
    .addTag('users', 'User settings and history')
    .addTag('admin', 'Background task management')
    .setContact(
      'SafeRoute API Support',
      'https://github.com/ss2d22/saferoute',
      '',
    )
    .setLicense('MIT License', 'https://opensource.org/licenses/MIT')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  const port = configService.get<number>('port') || 8000;
  await app.listen(port);

  logger.log(`Application is running on: http://localhost:${port}`);
  logger.log(`Swagger documentation: http://localhost:${port}/docs`);
}

bootstrap();
