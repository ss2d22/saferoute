/**
 * Utility functions for safety and risk score calculations.
 */

/**
 * Returns weight factor based on crime age.
 *
 * Recent crimes are weighted higher than older ones.
 *
 * @param monthsAgo - Number of months since the crime occurred
 * @returns Weight factor between 0.25 and 1.0
 */
export function getRecencyWeight(monthsAgo: number): number {
  if (monthsAgo <= 3) {
    return 1.0;
  } else if (monthsAgo <= 6) {
    return 0.75;
  } else if (monthsAgo <= 12) {
    return 0.5;
  } else {
    return 0.25;
  }
}

/**
 * Classify time into one of four daily periods.
 *
 * @param dt - Date to classify
 * @returns "night" (22:00-06:00), "morning" (06:00-09:00),
 *          "day" (09:00-17:00), or "evening" (17:00-22:00)
 */
export function getTimeBucket(dt: Date): string {
  const hour = dt.getHours();

  if (hour >= 22 || hour < 6) {
    return 'night';
  } else if (hour >= 6 && hour < 9) {
    return 'morning';
  } else if (hour >= 9 && hour < 17) {
    return 'day';
  } else {
    // 17 <= hour < 22
    return 'evening';
  }
}

/**
 * Weight crimes based on time bucket matching.
 *
 * Crimes that occurred in the same time period as the user's planned
 * travel time are weighted higher.
 *
 * @param crimeBucket - Time period when the crime occurred
 * @param userBucket - Time period when user plans to travel
 * @returns 1.5 if buckets match, 0.8 otherwise
 */
export function getTimeWeight(crimeBucket: string, userBucket: string): number {
  if (crimeBucket === userBucket) {
    return 1.5; // Emphasize crimes in same time bucket
  } else {
    return 0.8; // De-emphasize crimes in different time buckets
  }
}

/**
 * Calculate number of months between two dates.
 *
 * @param crimeMonth - Earlier date (month of crime)
 * @param currentMonth - Later date (usually today)
 * @returns Number of complete months between dates
 */
export function calculateMonthsAgo(
  crimeMonth: Date,
  currentMonth: Date,
): number {
  const yearDiff = currentMonth.getFullYear() - crimeMonth.getFullYear();
  const monthDiff = currentMonth.getMonth() - crimeMonth.getMonth();
  return yearDiff * 12 + monthDiff;
}

/**
 * Scale value to 0-1 range.
 *
 * @param value - Value to scale
 * @param minVal - Range minimum
 * @param maxVal - Range maximum
 * @returns Value scaled to [0, 1], or 0.5 if min equals max
 */
export function normalizeScore(
  value: number,
  minVal: number,
  maxVal: number,
): number {
  if (maxVal === minVal) {
    return 0.5;
  }
  return (value - minVal) / (maxVal - minVal + 1e-9);
}

/**
 * Convert risk to safety score (inverse relationship).
 *
 * @param risk - Risk value from 0 to 1 (higher = more dangerous)
 * @returns Safety score from 0 to 100 (higher = safer)
 */
export function riskToSafetyScore(risk: number): number {
  const safety = (1.0 - risk) * 100;
  return Math.max(0, Math.min(100, safety));
}

/**
 * Calculate weighted average of scores
 *
 * @param scores - Array of score values
 * @param weights - Array of weight values (same length as scores)
 * @returns Weighted average
 */
export function weightedAverage(
  scores: number[],
  weights: number[],
): number {
  if (scores.length !== weights.length) {
    throw new Error('Scores and weights arrays must have the same length');
  }

  if (scores.length === 0) {
    return 0;
  }

  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  if (totalWeight === 0) {
    return 0;
  }

  const weightedSum = scores.reduce(
    (sum, score, i) => sum + score * weights[i],
    0,
  );
  return weightedSum / totalWeight;
}

/**
 * Calculate exponential decay weight based on time
 *
 * @param daysAgo - Number of days since event
 * @param halfLifeDays - Number of days for weight to decay to 0.5
 * @returns Weight between 0 and 1
 */
export function exponentialDecayWeight(
  daysAgo: number,
  halfLifeDays: number = 180,
): number {
  return Math.exp(-Math.log(2) * (daysAgo / halfLifeDays));
}

/**
 * Clamp a value between min and max
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
