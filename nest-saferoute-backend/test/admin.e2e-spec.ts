import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { ConfigService } from '@nestjs/config';

describe('AdminController (e2e)', () => {
  let app: INestApplication;
  let configService: ConfigService;
  let adminApiKey: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();

    configService = moduleFixture.get<ConfigService>(ConfigService);
    adminApiKey = configService.get<string>('admin.apiKey') || '';
  }, 30000);

  afterAll(async () => {
    await app.close();
  });

  describe('Authentication', () => {
    it('should reject requests without admin API key', () => {
      return request(app.getHttpServer())
        .get('/admin/ingestion-progress')
        .expect(401)
        .expect((res) => {
          expect(res.body.message).toContain('Admin API key required');
        });
    });

    it('should reject requests with invalid admin API key (X-Admin-API-Key header)', () => {
      return request(app.getHttpServer())
        .get('/admin/ingestion-progress')
        .set('X-Admin-API-Key', 'invalid-key')
        .expect(401)
        .expect((res) => {
          expect(res.body.message).toContain('Invalid admin API key');
        });
    });

    it('should reject requests with invalid admin API key (Bearer token)', () => {
      return request(app.getHttpServer())
        .get('/admin/ingestion-progress')
        .set('Authorization', 'Bearer invalid-key')
        .expect(401)
        .expect((res) => {
          expect(res.body.message).toContain('Invalid admin API key');
        });
    });

    it('should accept requests with valid admin API key (X-Admin-API-Key header)', () => {
      return request(app.getHttpServer())
        .get('/admin/ingestion-progress')
        .set('X-Admin-API-Key', adminApiKey)
        .expect(200);
    });

    it('should accept requests with valid admin API key (Bearer token)', () => {
      return request(app.getHttpServer())
        .get('/admin/ingestion-progress')
        .set('Authorization', `Bearer ${adminApiKey}`)
        .expect(200);
    });
  });

  describe('GET /admin/ingestion-progress', () => {
    it('should return ingestion progress with valid API key', () => {
      return request(app.getHttpServer())
        .get('/admin/ingestion-progress')
        .set('X-Admin-API-Key', adminApiKey)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('total');
          expect(res.body).toHaveProperty('completed');
          expect(res.body).toHaveProperty('failed');
          expect(res.body).toHaveProperty('pending');
          expect(res.body).toHaveProperty('status');
        });
    });
  });

  describe('POST /admin/ingest-crimes', () => {
    it('should reject invalid date format', () => {
      return request(app.getHttpServer())
        .post('/admin/ingest-crimes')
        .set('X-Admin-API-Key', adminApiKey)
        .send({
          startMonth: 'invalid-date',
          endMonth: '2024-03',
        })
        .expect(400);
    });

    it('should reject missing startMonth', () => {
      return request(app.getHttpServer())
        .post('/admin/ingest-crimes')
        .set('X-Admin-API-Key', adminApiKey)
        .send({
          endMonth: '2024-03',
        })
        .expect(400);
    });

    it('should reject missing endMonth', () => {
      return request(app.getHttpServer())
        .post('/admin/ingest-crimes')
        .set('X-Admin-API-Key', adminApiKey)
        .send({
          startMonth: '2024-01',
        })
        .expect(400);
    });

    it('should accept valid date range and queue jobs', () => {
      return request(app.getHttpServer())
        .post('/admin/ingest-crimes')
        .set('X-Admin-API-Key', adminApiKey)
        .send({
          startMonth: '2024-01',
          endMonth: '2024-01',
        })
        .expect(202)
        .expect((res) => {
          expect(res.body).toHaveProperty('message');
          expect(res.body).toHaveProperty('jobIds');
          expect(res.body).toHaveProperty('jobCount');
          expect(res.body.message).toBe('Crime ingestion started');
          expect(Array.isArray(res.body.jobIds)).toBe(true);
          expect(typeof res.body.jobCount).toBe('number');
        });
    }, 30000);
  });

  describe('POST /admin/ingestion/pause', () => {
    it('should pause ingestion with valid API key', () => {
      return request(app.getHttpServer())
        .post('/admin/ingestion/pause')
        .set('X-Admin-API-Key', adminApiKey)
        .expect(200)
        .expect((res) => {
          expect(res.body.message).toBe('Crime ingestion paused');
        });
    });

    it('should reject without API key', () => {
      return request(app.getHttpServer())
        .post('/admin/ingestion/pause')
        .expect(401);
    });
  });

  describe('POST /admin/ingestion/resume', () => {
    it('should resume ingestion with valid API key', () => {
      return request(app.getHttpServer())
        .post('/admin/ingestion/resume')
        .set('X-Admin-API-Key', adminApiKey)
        .expect(200)
        .expect((res) => {
          expect(res.body.message).toBe('Crime ingestion resumed');
        });
    });

    it('should reject without API key', () => {
      return request(app.getHttpServer())
        .post('/admin/ingestion/resume')
        .expect(401);
    });
  });

  describe('POST /admin/ingestion/clear', () => {
    it('should clear ingestion queue with valid API key', () => {
      return request(app.getHttpServer())
        .post('/admin/ingestion/clear')
        .set('X-Admin-API-Key', adminApiKey)
        .expect(200)
        .expect((res) => {
          expect(res.body.message).toBe('Crime ingestion queue cleared');
        });
    });

    it('should reject without API key', () => {
      return request(app.getHttpServer())
        .post('/admin/ingestion/clear')
        .expect(401);
    });
  });

  describe('POST /admin/generate-h3-grid', () => {
    it('should reject invalid date format', () => {
      return request(app.getHttpServer())
        .post('/admin/generate-h3-grid')
        .set('X-Admin-API-Key', adminApiKey)
        .send({
          month: 'invalid-date',
        })
        .expect(400);
    });

    it('should reject missing month', () => {
      return request(app.getHttpServer())
        .post('/admin/generate-h3-grid')
        .set('X-Admin-API-Key', adminApiKey)
        .send({})
        .expect(400);
    });

    it('should reject invalid lookbackMonths (negative)', () => {
      return request(app.getHttpServer())
        .post('/admin/generate-h3-grid')
        .set('X-Admin-API-Key', adminApiKey)
        .send({
          month: '2024-09',
          lookbackMonths: -1,
        })
        .expect(400);
    });

    it('should reject invalid lookbackMonths (too large)', () => {
      return request(app.getHttpServer())
        .post('/admin/generate-h3-grid')
        .set('X-Admin-API-Key', adminApiKey)
        .send({
          month: '2024-09',
          lookbackMonths: 121, // Max is 120
        })
        .expect(400);
    });

    it('should reject invalid resolution (too low)', () => {
      return request(app.getHttpServer())
        .post('/admin/generate-h3-grid')
        .set('X-Admin-API-Key', adminApiKey)
        .send({
          month: '2024-09',
          resolution: 7, // Min is 8
        })
        .expect(400);
    });

    it('should reject invalid resolution (too high)', () => {
      return request(app.getHttpServer())
        .post('/admin/generate-h3-grid')
        .set('X-Admin-API-Key', adminApiKey)
        .send({
          month: '2024-09',
          resolution: 13, // Max is 12
        })
        .expect(400);
    });

    it('should generate H3 grid with default parameters', () => {
      return request(app.getHttpServer())
        .post('/admin/generate-h3-grid')
        .set('X-Admin-API-Key', adminApiKey)
        .send({
          month: '2024-09',
        })
        .expect(202)
        .expect((res) => {
          expect(res.body).toHaveProperty('message');
          expect(res.body).toHaveProperty('processed');
          expect(res.body).toHaveProperty('created');
          expect(res.body).toHaveProperty('updated');
          expect(res.body).toHaveProperty('month');
          expect(res.body.message).toBe('H3 grid generated successfully');
          expect(res.body.month).toBe('2024-09');
        });
    }, 60000);

    it('should generate H3 grid with custom lookback months', () => {
      return request(app.getHttpServer())
        .post('/admin/generate-h3-grid')
        .set('X-Admin-API-Key', adminApiKey)
        .send({
          month: '2024-09',
          lookbackMonths: 6,
        })
        .expect(202)
        .expect((res) => {
          expect(res.body).toHaveProperty('processed');
          expect(typeof res.body.processed).toBe('number');
        });
    }, 60000);

    it('should generate H3 grid with custom resolution', () => {
      return request(app.getHttpServer())
        .post('/admin/generate-h3-grid')
        .set('X-Admin-API-Key', adminApiKey)
        .send({
          month: '2024-09',
          resolution: 9,
        })
        .expect(202)
        .expect((res) => {
          expect(res.body).toHaveProperty('processed');
          expect(typeof res.body.processed).toBe('number');
        });
    }, 60000);

    it('should reject without API key', () => {
      return request(app.getHttpServer())
        .post('/admin/generate-h3-grid')
        .send({
          month: '2024-09',
        })
        .expect(401);
    });
  });

  describe('Integration Flow', () => {
    it('should complete full workflow: ingest -> check progress -> clear', async () => {
      // Step 1: Trigger ingestion
      const ingestResponse = await request(app.getHttpServer())
        .post('/admin/ingest-crimes')
        .set('X-Admin-API-Key', adminApiKey)
        .send({
          startMonth: '2024-01',
          endMonth: '2024-01',
        })
        .expect(202);

      expect(ingestResponse.body.jobIds.length).toBeGreaterThan(0);

      // Step 2: Check progress
      const progressResponse = await request(app.getHttpServer())
        .get('/admin/ingestion-progress')
        .set('X-Admin-API-Key', adminApiKey)
        .expect(200);

      expect(progressResponse.body).toHaveProperty('total');

      // Step 3: Clear queue
      await request(app.getHttpServer())
        .post('/admin/ingestion/clear')
        .set('X-Admin-API-Key', adminApiKey)
        .expect(200);
    }, 60000);

    it('should handle pause and resume workflow', async () => {
      // Pause
      await request(app.getHttpServer())
        .post('/admin/ingestion/pause')
        .set('X-Admin-API-Key', adminApiKey)
        .expect(200);

      // Resume
      await request(app.getHttpServer())
        .post('/admin/ingestion/resume')
        .set('X-Admin-API-Key', adminApiKey)
        .expect(200);
    });
  });
});
