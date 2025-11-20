import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AuthModule } from './auth.module';
import { AuthService } from './auth.service';
import { User } from '../user/entities/user.entity';
import { RouteHistory } from '../route/entities/route-history.entity';
import { RegisterDto } from './dto/register.dto';
import configuration from '../../config/configuration';

describe('AuthModule Integration Tests', () => {
  let app: INestApplication;
  let authService: AuthService;
  let testUser: { email: string; password: string };

  beforeAll(async () => {
    testUser = {
      email: `test-${Date.now()}@example.com`,
      password: 'TestPassword123!',
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [configuration],
          envFilePath: ['.env.test', '.env.local', '.env'],
        }),
        TypeOrmModule.forRootAsync({
          imports: [ConfigModule],
          useFactory: (configService: ConfigService) => ({
            type: 'postgres',
            host: configService.get('database.host'),
            port: configService.get('database.port'),
            username: configService.get('database.username'),
            password: configService.get('database.password'),
            database: configService.get('database.database'),
            entities: [User, RouteHistory],
            synchronize: false,
          }),
          inject: [ConfigService],
        }),
        TypeOrmModule.forFeature([User, RouteHistory]),
        JwtModule.registerAsync({
          imports: [ConfigModule],
          useFactory: (configService: ConfigService) => ({
            secret: configService.get<string>('jwt.secret'),
            signOptions: {
              expiresIn:
                (configService.get<string>('jwt.accessTokenExpiration') ||
                  '15m') as any,
            },
          }),
          inject: [ConfigService],
        }),
        AuthModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();

    authService = moduleFixture.get<AuthService>(AuthService);
  }, 30000); // 30 second timeout for setup

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('User Registration', () => {
    it('should successfully register a new user', async () => {
      const registerDto: RegisterDto = {
        email: testUser.email,
        password: testUser.password,
      };

      const result = await authService.register(registerDto);

      expect(result).toBeDefined();
      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(result.tokenType).toBe('bearer');
      expect(result.expiresIn).toBeGreaterThan(0);
    });

    it('should not allow duplicate email registration', async () => {
      const registerDto: RegisterDto = {
        email: testUser.email,
        password: testUser.password,
      };

      await expect(authService.register(registerDto)).rejects.toThrow();
    });
  });

  describe('User Login', () => {
    it('should successfully validate user with valid credentials', async () => {
      const user = await authService.validateUser(
        testUser.email,
        testUser.password,
      );

      expect(user).toBeDefined();
      expect(user?.email).toBe(testUser.email);
    });

    it('should return null for invalid email', async () => {
      const user = await authService.validateUser(
        'nonexistent@example.com',
        'password',
      );

      expect(user).toBeNull();
    });

    it('should return null for invalid password', async () => {
      const user = await authService.validateUser(
        testUser.email,
        'wrongpassword',
      );

      expect(user).toBeNull();
    });

    it('should generate tokens on successful login', async () => {
      const user = await authService.validateUser(
        testUser.email,
        testUser.password,
      );
      expect(user).toBeDefined();

      if (user) {
        const result = await authService.login(user);

        expect(result).toBeDefined();
        expect(result.accessToken).toBeDefined();
        expect(result.refreshToken).toBeDefined();
      }
    });
  });

  describe('Token Refresh', () => {
    it('should successfully refresh tokens with valid refresh token', async () => {
      const user = await authService.validateUser(
        testUser.email,
        testUser.password,
      );
      expect(user).toBeDefined();

      if (user) {
        const loginResult = await authService.login(user);
        const refreshResult = await authService.refreshToken(
          loginResult.refreshToken,
        );

        expect(refreshResult).toBeDefined();
        expect(refreshResult.accessToken).toBeDefined();
        expect(refreshResult.refreshToken).toBeDefined();
      }
    });

    it('should reject invalid refresh token', async () => {
      await expect(
        authService.refreshToken('invalid.token.here'),
      ).rejects.toThrow();
    });
  });

  describe('User Settings', () => {
    it('should create user with default settings', async () => {
      const user = await authService.validateUser(
        testUser.email,
        testUser.password,
      );
      expect(user).toBeDefined();

      if (user) {
        expect(user.settings).toBeDefined();
        expect(user.settings.historyEnabled).toBe(true);
        expect(user.settings.defaultSafetyWeight).toBeDefined();
        expect(user.settings.defaultLookbackMonths).toBeDefined();
      }
    });
  });
});
