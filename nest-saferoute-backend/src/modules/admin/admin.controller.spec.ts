import { Test, TestingModule } from '@nestjs/testing';
import { AdminController } from './admin.controller';
import { CrimeIngestionService } from '../crime/services/crime-ingestion.service';
import { H3GridService } from '../safety/services/h3-grid.service';
import { IngestCrimesDto } from './dto/ingest-crimes.dto';
import { GenerateH3GridDto } from './dto/generate-h3-grid.dto';
import { AdminApiKeyGuard } from '../../common/guards/admin-api-key.guard';

describe('AdminController', () => {
  let controller: AdminController;
  let crimeIngestionService: CrimeIngestionService;
  let h3GridService: H3GridService;

  const mockCrimeIngestionService = {
    ingestCrimeData: jest.fn(),
    getIngestionProgress: jest.fn(),
    pauseIngestion: jest.fn(),
    resumeIngestion: jest.fn(),
    clearIngestion: jest.fn(),
  };

  const mockH3GridService = {
    populateH3GridForMonth: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        {
          provide: CrimeIngestionService,
          useValue: mockCrimeIngestionService,
        },
        {
          provide: H3GridService,
          useValue: mockH3GridService,
        },
      ],
    })
      .overrideGuard(AdminApiKeyGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AdminController>(AdminController);
    crimeIngestionService = module.get<CrimeIngestionService>(
      CrimeIngestionService,
    );
    h3GridService = module.get<H3GridService>(H3GridService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('ingestCrimes', () => {
    it('should trigger crime ingestion and return job details', async () => {
      const dto: IngestCrimesDto = {
        startMonth: '2024-01',
        endMonth: '2024-03',
      };

      const mockJobIds = [
        'crime-2024-01-cell-0',
        'crime-2024-01-cell-1',
        'crime-2024-02-cell-0',
      ];

      mockCrimeIngestionService.ingestCrimeData.mockResolvedValue({
        jobIds: mockJobIds,
      });

      const result = await controller.ingestCrimes(dto);

      expect(result).toEqual({
        message: 'Crime ingestion started',
        jobIds: mockJobIds,
        jobCount: 3,
      });

      expect(mockCrimeIngestionService.ingestCrimeData).toHaveBeenCalledWith(
        new Date('2024-01-01'),
        new Date('2024-03-01'),
      );
    });

    it('should handle single month ingestion', async () => {
      const dto: IngestCrimesDto = {
        startMonth: '2024-06',
        endMonth: '2024-06',
      };

      const mockJobIds = ['crime-2024-06-cell-0'];

      mockCrimeIngestionService.ingestCrimeData.mockResolvedValue({
        jobIds: mockJobIds,
      });

      const result = await controller.ingestCrimes(dto);

      expect(result.jobCount).toBe(1);
      expect(mockCrimeIngestionService.ingestCrimeData).toHaveBeenCalledWith(
        new Date('2024-06-01'),
        new Date('2024-06-01'),
      );
    });

    it('should handle empty job results', async () => {
      const dto: IngestCrimesDto = {
        startMonth: '2024-01',
        endMonth: '2024-01',
      };

      mockCrimeIngestionService.ingestCrimeData.mockResolvedValue({
        jobIds: [],
      });

      const result = await controller.ingestCrimes(dto);

      expect(result.jobCount).toBe(0);
      expect(result.jobIds).toEqual([]);
    });
  });

  describe('getIngestionProgress', () => {
    it('should return current ingestion progress', async () => {
      const mockProgress = {
        total: 192,
        completed: 150,
        failed: 2,
        pending: 40,
        status: 'running',
      };

      mockCrimeIngestionService.getIngestionProgress.mockResolvedValue(
        mockProgress,
      );

      const result = await controller.getIngestionProgress();

      expect(result).toEqual(mockProgress);
      expect(
        mockCrimeIngestionService.getIngestionProgress,
      ).toHaveBeenCalledTimes(1);
    });

    it('should handle idle status', async () => {
      const mockProgress = {
        total: 0,
        completed: 0,
        failed: 0,
        pending: 0,
        status: 'idle',
      };

      mockCrimeIngestionService.getIngestionProgress.mockResolvedValue(
        mockProgress,
      );

      const result = await controller.getIngestionProgress();

      expect(result.status).toBe('idle');
      expect(result.total).toBe(0);
    });
  });

  describe('pauseIngestion', () => {
    it('should pause crime ingestion', async () => {
      mockCrimeIngestionService.pauseIngestion.mockResolvedValue(undefined);

      const result = await controller.pauseIngestion();

      expect(result).toEqual({ message: 'Crime ingestion paused' });
      expect(mockCrimeIngestionService.pauseIngestion).toHaveBeenCalledTimes(1);
    });
  });

  describe('resumeIngestion', () => {
    it('should resume crime ingestion', async () => {
      mockCrimeIngestionService.resumeIngestion.mockResolvedValue(undefined);

      const result = await controller.resumeIngestion();

      expect(result).toEqual({ message: 'Crime ingestion resumed' });
      expect(mockCrimeIngestionService.resumeIngestion).toHaveBeenCalledTimes(
        1,
      );
    });
  });

  describe('clearIngestion', () => {
    it('should clear ingestion queue', async () => {
      mockCrimeIngestionService.clearIngestion.mockResolvedValue(undefined);

      const result = await controller.clearIngestion();

      expect(result).toEqual({ message: 'Crime ingestion queue cleared' });
      expect(mockCrimeIngestionService.clearIngestion).toHaveBeenCalledTimes(1);
    });
  });

  describe('generateH3Grid', () => {
    it('should generate H3 grid with default parameters', async () => {
      const dto: GenerateH3GridDto = {
        month: '2024-09',
      };

      const mockResult = {
        processed: 1247,
        created: 1247,
        updated: 0,
      };

      mockH3GridService.populateH3GridForMonth.mockResolvedValue(mockResult);

      const result = await controller.generateH3Grid(dto);

      expect(result).toEqual({
        message: 'H3 grid generated successfully',
        processed: 1247,
        created: 1247,
        updated: 0,
        month: '2024-09',
      });

      expect(mockH3GridService.populateH3GridForMonth).toHaveBeenCalledWith(
        new Date('2024-09-01'),
        12, // default lookbackMonths
        10, // default resolution
      );
    });

    it('should generate H3 grid with custom lookback months', async () => {
      const dto: GenerateH3GridDto = {
        month: '2024-09',
        lookbackMonths: 6,
      };

      const mockResult = {
        processed: 800,
        created: 800,
        updated: 0,
      };

      mockH3GridService.populateH3GridForMonth.mockResolvedValue(mockResult);

      const result = await controller.generateH3Grid(dto);

      expect(result.processed).toBe(800);
      expect(mockH3GridService.populateH3GridForMonth).toHaveBeenCalledWith(
        new Date('2024-09-01'),
        6,
        10,
      );
    });

    it('should generate H3 grid with custom resolution', async () => {
      const dto: GenerateH3GridDto = {
        month: '2024-09',
        resolution: 9,
      };

      const mockResult = {
        processed: 320,
        created: 320,
        updated: 0,
      };

      mockH3GridService.populateH3GridForMonth.mockResolvedValue(mockResult);

      const result = await controller.generateH3Grid(dto);

      expect(mockH3GridService.populateH3GridForMonth).toHaveBeenCalledWith(
        new Date('2024-09-01'),
        12,
        9,
      );
    });

    it('should generate H3 grid with both custom parameters', async () => {
      const dto: GenerateH3GridDto = {
        month: '2024-09',
        lookbackMonths: 24,
        resolution: 11,
      };

      const mockResult = {
        processed: 5000,
        created: 4500,
        updated: 500,
      };

      mockH3GridService.populateH3GridForMonth.mockResolvedValue(mockResult);

      const result = await controller.generateH3Grid(dto);

      expect(result).toEqual({
        message: 'H3 grid generated successfully',
        processed: 5000,
        created: 4500,
        updated: 500,
        month: '2024-09',
      });

      expect(mockH3GridService.populateH3GridForMonth).toHaveBeenCalledWith(
        new Date('2024-09-01'),
        24,
        11,
      );
    });

    it('should handle grid generation with updates to existing cells', async () => {
      const dto: GenerateH3GridDto = {
        month: '2024-09',
      };

      const mockResult = {
        processed: 1247,
        created: 100,
        updated: 1147,
      };

      mockH3GridService.populateH3GridForMonth.mockResolvedValue(mockResult);

      const result = await controller.generateH3Grid(dto);

      expect(result.created).toBe(100);
      expect(result.updated).toBe(1147);
    });

    it('should handle grid generation with zero results', async () => {
      const dto: GenerateH3GridDto = {
        month: '2024-09',
      };

      const mockResult = {
        processed: 0,
        created: 0,
        updated: 0,
      };

      mockH3GridService.populateH3GridForMonth.mockResolvedValue(mockResult);

      const result = await controller.generateH3Grid(dto);

      expect(result.processed).toBe(0);
      expect(result.created).toBe(0);
      expect(result.updated).toBe(0);
    });
  });
});
