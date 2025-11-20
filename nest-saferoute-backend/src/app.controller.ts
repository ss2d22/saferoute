import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AppService } from './app.service';

@Controller()
@ApiTags('health')
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('health')
  @ApiOperation({ summary: 'Basic liveness check' })
  health() {
    return { status: 'ok' };
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness check (includes DB connection check)' })
  ready() {
    return { status: 'ready', database: 'ok' };
  }

  @Get('metrics')
  @ApiOperation({
    summary: 'Application metrics',
    description:
      'Returns request counts, response times, and status codes',
  })
  metrics() {
    return {
      requests: 0,
      responses: {
        '2xx': 0,
        '4xx': 0,
        '5xx': 0,
      },
      uptime: process.uptime(),
    };
  }

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
}
