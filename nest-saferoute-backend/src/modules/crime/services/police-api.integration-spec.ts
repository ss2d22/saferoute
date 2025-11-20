import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { PoliceAPIService } from './police-api.service';
import configuration from '../../../config/configuration';

describe('PoliceAPIService Integration Tests', () => {
  let service: PoliceAPIService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [configuration],
          envFilePath: ['.env.test', '.env.local', '.env'],
        }),
        HttpModule,
      ],
      providers: [PoliceAPIService],
    }).compile();

    service = module.get<PoliceAPIService>(PoliceAPIService);
  });

  describe('Crime Data Normalization', () => {
    it('should correctly normalize crime data', () => {
      const rawCrime = {
        id: '123abc',
        category: 'violent-crime',
        location_type: 'Force',
        location: {
          latitude: '50.9097',
          longitude: '-1.4044',
          street: {
            id: 456,
            name: 'High Street',
          },
        },
        context: '',
        outcome_status: {
          category: 'Under investigation',
          date: '2024-01',
        },
        persistent_id: 'abc123def456',
        month: '2024-01',
      };

      const normalized = service.normalizeCrime(rawCrime);

      expect(normalized).toBeDefined();
      expect(normalized.externalId).toBe('123abc');
      expect(normalized.month).toBe('2024-01');
      expect(normalized.category).toBe('violent-crime');
      expect(normalized.crimeType).toBe('Force');
      expect(normalized.latitude).toBe(50.9097);
      expect(normalized.longitude).toBe(-1.4044);
      expect(normalized.streetName).toBe('High Street');
      expect(normalized.outcomeStatus).toBe('Under investigation');
      expect(normalized.persistentId).toBe('abc123def456');
    });

    it('should handle missing fields gracefully', () => {
      const incompleteCrime = {
        id: '789xyz',
        category: 'burglary',
        month: '2024-01',
        location: {
          latitude: '0',
          longitude: '0',
        },
      };

      const normalized = service.normalizeCrime(incompleteCrime);

      expect(normalized).toBeDefined();
      expect(normalized.externalId).toBe('789xyz');
      expect(normalized.latitude).toBe(0);
      expect(normalized.longitude).toBe(0);
      expect(normalized.streetName).toBe('');
      expect(normalized.crimeType).toBe('');
    });
  });

  describe('Polygon Splitting', () => {
    it('should split a rectangular polygon into 4 quadrants', () => {
      const polygon: [number, number][] = [
        [50.9, -1.4],
        [50.9, -1.3],
        [51.0, -1.3],
        [51.0, -1.4],
      ];

      const quadrants = service.splitPolygon(polygon);

      expect(quadrants).toBeDefined();
      expect(quadrants.length).toBe(4);

      quadrants.forEach((quad) => {
        expect(quad.length).toBe(4);
        quad.forEach((point) => {
          expect(point.length).toBe(2);
          expect(typeof point[0]).toBe('number');
          expect(typeof point[1]).toBe('number');
        });
      });
    });
  });

  describe('Service Configuration', () => {
    it('should have correct retry configuration', () => {
      expect(service['maxRetries']).toBe(3);
      expect(service['retryDelays']).toEqual([1000, 2000, 4000]);
    });

    it('should have base URL configured', () => {
      expect(service['baseUrl']).toBeDefined();
      expect(service['baseUrl']).toContain('police.uk');
    });
  });
});
