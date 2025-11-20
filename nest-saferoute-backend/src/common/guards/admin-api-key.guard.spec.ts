import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AdminApiKeyGuard } from './admin-api-key.guard';

describe('AdminApiKeyGuard', () => {
  let guard: AdminApiKeyGuard;
  let configService: ConfigService;

  const mockConfigService = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminApiKeyGuard,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    guard = module.get<AdminApiKeyGuard>(AdminApiKeyGuard);
    configService = module.get<ConfigService>(ConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const createMockExecutionContext = (headers: Record<string, any>): ExecutionContext => {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          headers,
        }),
      }),
    } as ExecutionContext;
  };

  describe('canActivate', () => {
    const validApiKey = 'valid-admin-key-12345';

    it('should allow access with valid X-Admin-API-Key header', () => {
      mockConfigService.get.mockReturnValue(validApiKey);
      const context = createMockExecutionContext({
        'x-admin-api-key': validApiKey,
      });

      const result = guard.canActivate(context);

      expect(result).toBe(true);
      expect(mockConfigService.get).toHaveBeenCalledWith('admin.apiKey');
    });

    it('should allow access with valid Authorization: Bearer header', () => {
      mockConfigService.get.mockReturnValue(validApiKey);
      const context = createMockExecutionContext({
        authorization: `Bearer ${validApiKey}`,
      });

      const result = guard.canActivate(context);

      expect(result).toBe(true);
      expect(mockConfigService.get).toHaveBeenCalledWith('admin.apiKey');
    });

    it('should throw UnauthorizedException if admin API key is not configured', () => {
      mockConfigService.get.mockReturnValue(undefined);
      const context = createMockExecutionContext({
        'x-admin-api-key': validApiKey,
      });

      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
      expect(() => guard.canActivate(context)).toThrow('Admin API key not configured');
    });

    it('should throw UnauthorizedException if admin API key is empty string', () => {
      mockConfigService.get.mockReturnValue('');
      const context = createMockExecutionContext({
        'x-admin-api-key': validApiKey,
      });

      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
      expect(() => guard.canActivate(context)).toThrow('Admin API key not configured');
    });

    it('should throw UnauthorizedException if no API key is provided', () => {
      mockConfigService.get.mockReturnValue(validApiKey);
      const context = createMockExecutionContext({});

      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
      expect(() => guard.canActivate(context)).toThrow('Admin API key required');
    });

    it('should throw UnauthorizedException if API key is invalid', () => {
      mockConfigService.get.mockReturnValue(validApiKey);
      const context = createMockExecutionContext({
        'x-admin-api-key': 'invalid-key',
      });

      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
      expect(() => guard.canActivate(context)).toThrow('Invalid admin API key');
    });

    it('should throw UnauthorizedException if Bearer token is invalid', () => {
      mockConfigService.get.mockReturnValue(validApiKey);
      const context = createMockExecutionContext({
        authorization: 'Bearer invalid-key',
      });

      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
      expect(() => guard.canActivate(context)).toThrow('Invalid admin API key');
    });

    it('should handle array header values (from some proxies)', () => {
      mockConfigService.get.mockReturnValue(validApiKey);
      const context = createMockExecutionContext({
        'x-admin-api-key': [validApiKey, 'other-value'],
      });

      const result = guard.canActivate(context);

      expect(result).toBe(true);
    });

    it('should prioritize X-Admin-API-Key over Authorization header', () => {
      mockConfigService.get.mockReturnValue(validApiKey);
      const context = createMockExecutionContext({
        'x-admin-api-key': validApiKey,
        authorization: 'Bearer different-key',
      });

      const result = guard.canActivate(context);

      expect(result).toBe(true);
    });

    it('should reject Authorization header without Bearer prefix', () => {
      mockConfigService.get.mockReturnValue(validApiKey);
      const context = createMockExecutionContext({
        authorization: validApiKey, // Missing "Bearer " prefix
      });

      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
      expect(() => guard.canActivate(context)).toThrow('Admin API key required');
    });

    it('should handle case-insensitive header names', () => {
      mockConfigService.get.mockReturnValue(validApiKey);
      // Express lowercases all headers, so this tests that scenario
      const context = createMockExecutionContext({
        'x-admin-api-key': validApiKey,
      });

      const result = guard.canActivate(context);

      expect(result).toBe(true);
    });
  });
});
