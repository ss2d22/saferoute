import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { of, throwError } from 'rxjs';
import { PoliceAPIService } from './police-api.service';

describe('PoliceAPIService', () => {
  let service: PoliceAPIService;
  let httpService: HttpService;

  const mockHttpService = {
    get: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn().mockReturnValue('https://data.police.uk/api'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PoliceAPIService,
        {
          provide: HttpService,
          useValue: mockHttpService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<PoliceAPIService>(PoliceAPIService);
    httpService = module.get<HttpService>(HttpService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getCrimesStreet', () => {
    it('should fetch crimes successfully', async () => {
      const mockCrimes = [
        {
          id: '1',
          month: '2024-01',
          category: 'violent-crime',
          location: {
            latitude: '50.9',
            longitude: '-1.4',
          },
        },
      ];

      mockHttpService.get.mockReturnValue(
        of({
          status: 200,
          data: mockCrimes,
        }),
      );

      const polygon: [number, number][] = [
        [50.9, -1.4],
        [51.0, -1.4],
        [51.0, -1.3],
        [50.9, -1.3],
      ];
      const month = new Date('2024-01-01');

      const result = await service.getCrimesStreet(polygon, month);

      expect(result.crimes).toEqual(mockCrimes);
      expect(result.statusCode).toBe(200);
    });

    it('should handle 503 response (too many results)', async () => {
      mockHttpService.get.mockReturnValue(
        throwError(() => ({
          response: {
            status: 503,
          },
        })),
      );

      const polygon: [number, number][] = [
        [50.9, -1.4],
        [51.0, -1.4],
      ];
      const month = new Date('2024-01-01');

      const result = await service.getCrimesStreet(polygon, month);

      expect(result.crimes).toEqual([]);
      expect(result.statusCode).toBe(503);
    });

    it('should handle 404 response (no data)', async () => {
      mockHttpService.get.mockReturnValue(
        throwError(() => ({
          response: {
            status: 404,
          },
        })),
      );

      const polygon: [number, number][] = [
        [50.9, -1.4],
        [51.0, -1.4],
      ];
      const month = new Date('2024-01-01');

      const result = await service.getCrimesStreet(polygon, month);

      expect(result.crimes).toEqual([]);
      expect(result.statusCode).toBe(404);
    });

    it('should retry on failure', async () => {
      mockHttpService.get
        .mockReturnValueOnce(
          throwError(() => ({
            response: {
              status: 500,
            },
          })),
        )
        .mockReturnValueOnce(
          throwError(() => ({
            response: {
              status: 500,
            },
          })),
        )
        .mockReturnValueOnce(
          of({
            status: 200,
            data: [],
          }),
        );

      const polygon: [number, number][] = [
        [50.9, -1.4],
        [51.0, -1.4],
      ];
      const month = new Date('2024-01-01');

      const result = await service.getCrimesStreet(polygon, month);

      expect(result.statusCode).toBe(200);
      expect(mockHttpService.get).toHaveBeenCalledTimes(3);
    });
  });

  describe('splitPolygon', () => {
    it('should split polygon into 4 quadrants', () => {
      const polygon: [number, number][] = [
        [50.0, -2.0],
        [50.0, -1.0],
        [51.0, -1.0],
        [51.0, -2.0],
      ];

      const quadrants = service.splitPolygon(polygon);

      expect(quadrants).toHaveLength(4);

      // Bottom-left quadrant
      expect(quadrants[0]).toEqual([
        [50.0, -2.0],
        [50.5, -2.0],
        [50.5, -1.5],
        [50.0, -1.5],
      ]);

      // Top-right quadrant
      expect(quadrants[3]).toEqual([
        [50.5, -1.5],
        [51.0, -1.5],
        [51.0, -1.0],
        [50.5, -1.0],
      ]);
    });
  });

  describe('getCrimesWithSplit', () => {
    it('should return crimes without splitting if count is acceptable', async () => {
      const mockCrimes = [{ id: '1', category: 'violent-crime' }];

      mockHttpService.get.mockReturnValue(
        of({
          status: 200,
          data: mockCrimes,
        }),
      );

      const polygon: [number, number][] = [
        [50.9, -1.4],
        [51.0, -1.4],
      ];
      const month = new Date('2024-01-01');

      const result = await service.getCrimesWithSplit(polygon, month);

      expect(result).toEqual(mockCrimes);
    });

    it('should split polygon and recurse on 503 response', async () => {
      // First call returns 503 (too many results)
      mockHttpService.get.mockReturnValueOnce(
        throwError(() => ({
          response: {
            status: 503,
          },
        })),
      );

      // Subsequent calls for quadrants return data
      for (let i = 0; i < 4; i++) {
        mockHttpService.get.mockReturnValueOnce(
          of({
            status: 200,
            data: [{ id: `crime-${i}` }],
          }),
        );
      }

      const polygon: [number, number][] = [
        [50.0, -2.0],
        [51.0, -2.0],
        [51.0, -1.0],
        [50.0, -1.0],
      ];
      const month = new Date('2024-01-01');

      const result = await service.getCrimesWithSplit(polygon, month);

      expect(result).toHaveLength(4);
      expect(mockHttpService.get).toHaveBeenCalledTimes(5); // 1 initial + 4 quadrants
    });

    it('should stop at max depth', async () => {
      mockHttpService.get.mockReturnValue(
        throwError(() => ({
          response: {
            status: 503,
          },
        })),
      );

      const polygon: [number, number][] = [
        [50.0, -2.0],
        [51.0, -2.0],
      ];
      const month = new Date('2024-01-01');

      const result = await service.getCrimesWithSplit(polygon, month, 0);

      expect(result).toEqual([]);
    });
  });

  describe('normalizeCrime', () => {
    it('should normalize complete crime data', () => {
      const crimeData = {
        id: 'abc123',
        month: '2024-01',
        category: 'violent-crime',
        location_type: 'Force',
        context: 'Context text',
        persistent_id: 'persist123',
        location: {
          latitude: '50.9',
          longitude: '-1.4',
          street: {
            name: 'High Street',
          },
        },
        outcome_status: {
          category: 'Under investigation',
        },
      };

      const result = service.normalizeCrime(crimeData);

      expect(result).toEqual({
        externalId: 'abc123',
        month: '2024-01',
        category: 'violent-crime',
        crimeType: 'Force',
        context: 'Context text',
        persistentId: 'persist123',
        latitude: 50.9,
        longitude: -1.4,
        streetName: 'High Street',
        outcomeStatus: 'Under investigation',
      });
    });

    it('should handle missing optional fields', () => {
      const crimeData = {
        month: '2024-01',
        category: 'burglary',
      };

      const result = service.normalizeCrime(crimeData);

      expect(result).toEqual({
        externalId: undefined,
        month: '2024-01',
        category: 'burglary',
        crimeType: '',
        context: '',
        persistentId: undefined,
        latitude: 0,
        longitude: 0,
        streetName: '',
        outcomeStatus: undefined,
      });
    });
  });
});
