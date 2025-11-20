import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('UserController (e2e)', () => {
  let app: INestApplication;
  let accessToken: string;
  const testUser = {
    email: `user-e2e-${Date.now()}@example.com`,
    password: 'TestPassword123!',
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();

    // Register and login a test user
    const registerResponse = await request(app.getHttpServer())
      .post('/auth/register')
      .send(testUser);
    accessToken = registerResponse.body.accessToken;
  }, 30000);

  afterAll(async () => {
    await app.close();
  });

  describe('GET /users/me/settings', () => {
    it('should get user settings', () => {
      return request(app.getHttpServer())
        .get('/users/me/settings')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.historyEnabled).toBeDefined();
          expect(res.body.defaultSafetyWeight).toBeDefined();
          expect(res.body.defaultLookbackMonths).toBeDefined();
        });
    });

    it('should require authentication', () => {
      return request(app.getHttpServer())
        .get('/users/me/settings')
        .expect(401);
    });
  });

  describe('PATCH /users/me/settings', () => {
    it('should update user settings', () => {
      const newSettings = {
        historyEnabled: false,
        defaultSafetyWeight: 0.9,
        defaultLookbackMonths: 6,
      };

      return request(app.getHttpServer())
        .patch('/users/me/settings')
        .set('Authorization', `Bearer ${accessToken}`)
        .send(newSettings)
        .expect(200)
        .expect((res) => {
          expect(res.body.historyEnabled).toBe(false);
          expect(res.body.defaultSafetyWeight).toBe(0.9);
          expect(res.body.defaultLookbackMonths).toBe(6);
        });
    });

    it('should validate safety weight range', () => {
      return request(app.getHttpServer())
        .patch('/users/me/settings')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          defaultSafetyWeight: 1.5, // Invalid
        })
        .expect(400);
    });

    it('should validate lookback months', () => {
      return request(app.getHttpServer())
        .patch('/users/me/settings')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          defaultLookbackMonths: -1, // Invalid
        })
        .expect(400);
    });

    it('should require authentication', () => {
      return request(app.getHttpServer())
        .patch('/users/me/settings')
        .send({ historyEnabled: false })
        .expect(401);
    });

    it('should allow partial updates', () => {
      return request(app.getHttpServer())
        .patch('/users/me/settings')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ historyEnabled: true })
        .expect(200)
        .expect((res) => {
          expect(res.body.historyEnabled).toBe(true);
        });
    });
  });
});
