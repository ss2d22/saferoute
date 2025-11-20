import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

@Injectable()
export class AdminApiKeyGuard implements CanActivate {
  private readonly logger = new Logger(AdminApiKeyGuard.name);

  constructor(private configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const apiKey = this.extractApiKeyFromHeader(request);

    const adminApiKey = this.configService.get<string>('admin.apiKey');

    if (!adminApiKey) {
      this.logger.error('Admin API key not configured in environment variables');
      throw new UnauthorizedException('Admin API key not configured');
    }

    if (!apiKey) {
      this.logger.warn('Admin endpoint accessed without API key');
      throw new UnauthorizedException('Admin API key required');
    }

    if (apiKey !== adminApiKey) {
      this.logger.warn('Admin endpoint accessed with invalid API key');
      throw new UnauthorizedException('Invalid admin API key');
    }

    return true;
  }

  private extractApiKeyFromHeader(request: Request): string | undefined {
    // Check for X-Admin-API-Key header
    const headerKey = request.headers['x-admin-api-key'];
    if (headerKey) {
      return Array.isArray(headerKey) ? headerKey[0] : headerKey;
    }

    // Also support Authorization: Bearer <key> format
    const authHeader = request.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    return undefined;
  }
}
