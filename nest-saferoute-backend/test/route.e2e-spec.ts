import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('RouteController (e2e)', () => {
  let app: INestApplication;
  let accessToken: string;
  const testUser = {
    email: `route-e2e-${Date.now()}@example.com`,
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

  describe('POST /routes/safe', () => {
    const validRouteRequest = {
      origin: {
        lat: 50.9097,
        lng: -1.4044,
      },
      destination: {
        lat: 50.9107,
        lng: -1.4034,
      },
      mode: 'foot-walking',
      preferences: {
        safetyWeight: 0.8,
        lookbackMonths: 12,
        bufferMeters: 50,
      },
    };

    it('should validate origin coordinates', () => {
      return request(app.getHttpServer())
        .post('/routes/safe')
        .send({
          origin: { lat: 'invalid', lng: -1.4044 },
          destination: validRouteRequest.destination,
        })
        .expect(400);
    });

    it('should validate destination coordinates', () => {
      return request(app.getHttpServer())
        .post('/routes/safe')
        .send({
          origin: validRouteRequest.origin,
          destination: { lat: 50.9107, lng: 'invalid' },
        })
        .expect(400);
    });

    it('should require origin and destination', () => {
      return request(app.getHttpServer())
        .post('/routes/safe')
        .send({})
        .expect(400);
    });

    it('should validate safety weight range (0-1)', () => {
      return request(app.getHttpServer())
        .post('/routes/safe')
        .send({
          ...validRouteRequest,
          preferences: {
            safetyWeight: 1.5, // Invalid
          },
        })
        .expect(400);
    });

    it('should validate lookback months', () => {
      return request(app.getHttpServer())
        .post('/routes/safe')
        .send({
          ...validRouteRequest,
          preferences: {
            lookbackMonths: -1, // Invalid
          },
        })
        .expect(400);
    });

    it('should accept different transport modes', async () => {
      const modes = ['foot-walking', 'cycling-regular'];

      for (const mode of modes) {
        await request(app.getHttpServer())
          .post('/routes/safe')
          .send({
            ...validRouteRequest,
            mode,
          })
          .expect(201);
      }
    });

    it('should handle departure time', () => {
      return request(app.getHttpServer())
        .post('/routes/safe')
        .send({
          ...validRouteRequest,
          departureTime: new Date().toISOString(),
        })
        .expect(201);
    });
  });

  describe('GET /routes/history', () => {
    it('should get route history for authenticated user', () => {
      return request(app.getHttpServer())
        .get('/routes/history')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toBeDefined();
          expect(res.body.history).toBeDefined();
          expect(Array.isArray(res.body.history)).toBe(true);
          expect(res.body.total).toBeDefined();
          expect(res.body.limit).toBeDefined();
          expect(res.body.offset).toBeDefined();
        });
    });

    it('should require authentication', () => {
      return request(app.getHttpServer()).get('/routes/history').expect(401);
    });
  });
});
