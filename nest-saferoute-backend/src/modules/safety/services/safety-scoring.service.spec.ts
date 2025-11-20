import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SafetyScoringService } from './safety-scoring.service';
import { CrimeRepository } from '../../crime/repositories/crime.repository';
import { CrimeIncident } from '../../crime/entities/crime-incident.entity';

describe('SafetyScoringService', () => {
  let service: SafetyScoringService;
  let crimeRepository: CrimeRepository;

  const mockCrimeRepository = {
    findCrimesAlongRoute: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SafetyScoringService,
        {
          provide: CrimeRepository,
          useValue: mockCrimeRepository,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<SafetyScoringService>(SafetyScoringService);
    crimeRepository = module.get<CrimeRepository>(CrimeRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('calculateSafetyScoreForSegment', () => {
    it('should return perfect safety score for area with no crimes', async () => {
      mockCrimeRepository.findCrimesAlongRoute.mockResolvedValue([]);

      const result = await service.calculateSafetyScoreForSegment(
        'POLYGON((-1.4 50.9, -1.4 51, -1.3 51, -1.3 50.9, -1.4 50.9))',
        12,
        'day',
      );

      expect(result.safetyScore).toBe(100);
      expect(result.crimeCount).toBe(0);
      expect(result.weightedCrimeCount).toBe(0);
      expect(result.riskScore).toBe(0);
    });

    it('should calculate safety score with crimes present', async () => {
      const currentDate = new Date();
      const threeMonthsAgo = new Date();
      threeMonthsAgo.setMonth(currentDate.getMonth() - 3);

      const mockCrimes: Partial<CrimeIncident>[] = [
        {
          id: 1,
          month: threeMonthsAgo,
          categoryId: 'violent-crime',
          category: {
            id: 'violent-crime',
            name: 'Violence and sexual offences',
            harmWeightDefault: 8.0,
            isPersonal: true,
            isProperty: false,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        },
        {
          id: 2,
          month: threeMonthsAgo,
          categoryId: 'theft-from-the-person',
          category: {
            id: 'theft-from-the-person',
            name: 'Theft from the person',
            harmWeightDefault: 3.0,
            isPersonal: true,
            isProperty: true,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        },
      ];

      mockCrimeRepository.findCrimesAlongRoute.mockResolvedValue(mockCrimes);

      const result = await service.calculateSafetyScoreForSegment(
        'POLYGON((-1.4 50.9, -1.4 51, -1.3 51, -1.3 50.9, -1.4 50.9))',
        12,
        'day',
      );

      expect(result.safetyScore).toBeLessThan(100);
      expect(result.safetyScore).toBeGreaterThan(0);
      expect(result.crimeCount).toBe(2);
      expect(result.weightedCrimeCount).toBeGreaterThan(0);
      expect(result.riskScore).toBeGreaterThan(0);
      expect(result.riskScore).toBeLessThanOrEqual(1);
    });

    it('should apply time-of-day weighting correctly', async () => {
      const currentDate = new Date();
      const oneMonthAgo = new Date();
      oneMonthAgo.setMonth(currentDate.getMonth() - 1);

      const mockCrime: Partial<CrimeIncident> = {
        id: 1,
        month: oneMonthAgo,
        categoryId: 'violent-crime',
        category: {
          id: 'violent-crime',
          name: 'Violence and sexual offences',
          harmWeightDefault: 8.0,
          isPersonal: true,
          isProperty: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      };

      mockCrimeRepository.findCrimesAlongRoute.mockResolvedValue([mockCrime]);

      const dayResult = await service.calculateSafetyScoreForSegment(
        'POLYGON((-1.4 50.9, -1.4 51, -1.3 51, -1.3 50.9, -1.4 50.9))',
        12,
        'day',
      );

      const nightResult = await service.calculateSafetyScoreForSegment(
        'POLYGON((-1.4 50.9, -1.4 51, -1.3 51, -1.3 50.9, -1.4 50.9))',
        12,
        'night',
      );

      // Night should have lower safety score for violent crimes
      expect(nightResult.safetyScore).toBeLessThan(dayResult.safetyScore);
      expect(nightResult.weightedCrimeCount).toBeGreaterThan(
        dayResult.weightedCrimeCount,
      );
    });

    it('should apply recency weighting correctly', async () => {
      const currentDate = new Date();
      const recentCrime = new Date();
      recentCrime.setMonth(currentDate.getMonth() - 2); // 2 months ago

      const oldCrime = new Date();
      oldCrime.setMonth(currentDate.getMonth() - 10); // 10 months ago

      const mockRecentCrime: Partial<CrimeIncident> = {
        id: 1,
        month: recentCrime,
        categoryId: 'burglary',
        category: {
          id: 'burglary',
          name: 'Burglary',
          harmWeightDefault: 4.5,
          isPersonal: false,
          isProperty: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      };

      const mockOldCrime: Partial<CrimeIncident> = {
        id: 2,
        month: oldCrime,
        categoryId: 'burglary',
        category: {
          id: 'burglary',
          name: 'Burglary',
          harmWeightDefault: 4.5,
          isPersonal: false,
          isProperty: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      };

      // Test with recent crime
      mockCrimeRepository.findCrimesAlongRoute.mockResolvedValue([
        mockRecentCrime,
      ]);
      const recentResult = await service.calculateSafetyScoreForSegment(
        'POLYGON((-1.4 50.9, -1.4 51, -1.3 51, -1.3 50.9, -1.4 50.9))',
        12,
      );

      // Test with old crime
      mockCrimeRepository.findCrimesAlongRoute.mockResolvedValue([
        mockOldCrime,
      ]);
      const oldResult = await service.calculateSafetyScoreForSegment(
        'POLYGON((-1.4 50.9, -1.4 51, -1.3 51, -1.3 50.9, -1.4 50.9))',
        12,
      );

      // Recent crimes should have more impact (lower safety score)
      expect(recentResult.safetyScore).toBeLessThan(oldResult.safetyScore);
    });
  });

  describe('aggregateSafetyScores', () => {
    it('should aggregate scores with length weighting', () => {
      const segmentScores = [
        { safetyScore: 90, crimeCount: 2, weightedCrimeCount: 3, riskScore: 0.1 },
        { safetyScore: 80, crimeCount: 5, weightedCrimeCount: 7, riskScore: 0.2 },
        { safetyScore: 70, crimeCount: 10, weightedCrimeCount: 15, riskScore: 0.3 },
      ];
      const segmentLengths = [100, 200, 100]; // Total: 400m

      const result = service.aggregateSafetyScores(
        segmentScores,
        segmentLengths,
      );

      // Expected weighted safety score:
      // (90*100 + 80*200 + 70*100) / 400 = (9000 + 16000 + 7000) / 400 = 32000/400 = 80
      expect(result.safetyScore).toBe(80);
      expect(result.crimeCount).toBe(17); // 2 + 5 + 10
      expect(result.weightedCrimeCount).toBe(25); // 3 + 7 + 15
    });

    it('should handle single segment', () => {
      const segmentScores = [
        { safetyScore: 95, crimeCount: 1, weightedCrimeCount: 1.5, riskScore: 0.05 },
      ];
      const segmentLengths = [500];

      const result = service.aggregateSafetyScores(
        segmentScores,
        segmentLengths,
      );

      expect(result.safetyScore).toBe(95);
      expect(result.crimeCount).toBe(1);
      expect(result.weightedCrimeCount).toBe(1.5);
    });

    it('should handle empty segments', () => {
      const result = service.aggregateSafetyScores([], []);

      expect(result.safetyScore).toBe(100);
      expect(result.crimeCount).toBe(0);
      expect(result.weightedCrimeCount).toBe(0);
      expect(result.riskScore).toBe(0);
    });
  });
});
