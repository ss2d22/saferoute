import {
  getRecencyWeight,
  getTimeBucket,
  calculateMonthsAgo,
  normalizeScore,
  riskToSafetyScore,
  weightedAverage,
} from './scoring.utils';

describe('ScoringUtils', () => {
  describe('getRecencyWeight', () => {
    it('should return 1.0 for crimes <= 3 months old', () => {
      expect(getRecencyWeight(0)).toBe(1.0);
      expect(getRecencyWeight(3)).toBe(1.0);
    });

    it('should return 0.75 for crimes 4-6 months old', () => {
      expect(getRecencyWeight(4)).toBe(0.75);
      expect(getRecencyWeight(6)).toBe(0.75);
    });

    it('should return 0.5 for crimes 7-12 months old', () => {
      expect(getRecencyWeight(7)).toBe(0.5);
      expect(getRecencyWeight(12)).toBe(0.5);
    });

    it('should return 0.25 for crimes > 12 months old', () => {
      expect(getRecencyWeight(13)).toBe(0.25);
      expect(getRecencyWeight(24)).toBe(0.25);
    });
  });

  describe('getTimeBucket', () => {
    it('should classify night hours correctly', () => {
      expect(getTimeBucket(new Date('2025-01-01T00:00:00'))).toBe('night');
      expect(getTimeBucket(new Date('2025-01-01T05:59:59'))).toBe('night');
      expect(getTimeBucket(new Date('2025-01-01T22:00:00'))).toBe('night');
    });

    it('should classify morning hours correctly', () => {
      expect(getTimeBucket(new Date('2025-01-01T06:00:00'))).toBe('morning');
      expect(getTimeBucket(new Date('2025-01-01T08:59:59'))).toBe('morning');
    });

    it('should classify day hours correctly', () => {
      expect(getTimeBucket(new Date('2025-01-01T09:00:00'))).toBe('day');
      expect(getTimeBucket(new Date('2025-01-01T16:59:59'))).toBe('day');
    });

    it('should classify evening hours correctly', () => {
      expect(getTimeBucket(new Date('2025-01-01T17:00:00'))).toBe('evening');
      expect(getTimeBucket(new Date('2025-01-01T21:59:59'))).toBe('evening');
    });
  });

  describe('calculateMonthsAgo', () => {
    it('should calculate months difference correctly', () => {
      const crimeMonth = new Date('2024-01-01');
      const currentMonth = new Date('2025-01-01');
      expect(calculateMonthsAgo(crimeMonth, currentMonth)).toBe(12);
    });

    it('should return 0 for same month', () => {
      const date = new Date('2025-01-01');
      expect(calculateMonthsAgo(date, date)).toBe(0);
    });
  });

  describe('normalizeScore', () => {
    it('should normalize values correctly', () => {
      expect(normalizeScore(5, 0, 10)).toBeCloseTo(0.5, 2);
      expect(normalizeScore(0, 0, 10)).toBeCloseTo(0, 2);
      expect(normalizeScore(10, 0, 10)).toBeCloseTo(1, 2);
    });

    it('should return 0.5 when min equals max', () => {
      expect(normalizeScore(5, 5, 5)).toBe(0.5);
    });
  });

  describe('riskToSafetyScore', () => {
    it('should convert risk to safety score', () => {
      expect(riskToSafetyScore(0)).toBe(100);
      expect(riskToSafetyScore(1)).toBe(0);
      expect(riskToSafetyScore(0.5)).toBe(50);
    });

    it('should clamp values between 0 and 100', () => {
      expect(riskToSafetyScore(-0.1)).toBe(100);
      expect(riskToSafetyScore(1.1)).toBe(0);
    });
  });

  describe('weightedAverage', () => {
    it('should calculate weighted average correctly', () => {
      const scores = [80, 90, 70];
      const weights = [1, 2, 1];
      const result = weightedAverage(scores, weights);
      expect(result).toBeCloseTo(82.5, 2);
    });

    it('should return 0 for empty arrays', () => {
      expect(weightedAverage([], [])).toBe(0);
    });

    it('should throw error for mismatched array lengths', () => {
      expect(() => weightedAverage([1, 2], [1])).toThrow();
    });
  });
});
