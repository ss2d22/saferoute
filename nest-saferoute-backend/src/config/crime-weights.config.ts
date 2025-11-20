/**
 * Crime category time-of-day weights (based on UK crime statistical patterns)
 * Format: {category_id: {time_bucket: multiplier}}
 * These weights represent the relative likelihood of each crime type at different times
 */
export const CRIME_TIME_WEIGHTS: Record<string, Record<string, number>> = {
  'violent-crime': { night: 1.8, evening: 1.5, day: 0.8, morning: 0.6 },
  'anti-social-behaviour': { night: 1.7, evening: 1.6, day: 0.7, morning: 0.5 },
  'burglary': { night: 1.5, day: 1.2, evening: 1.0, morning: 0.8 },
  'robbery': { night: 1.6, evening: 1.4, day: 0.9, morning: 0.7 },
  'theft-from-the-person': { evening: 1.5, day: 1.3, night: 1.0, morning: 0.6 },
  'vehicle-crime': { night: 1.7, evening: 1.2, day: 0.8, morning: 0.6 },
  'shoplifting': { day: 1.8, evening: 1.3, morning: 0.7, night: 0.2 },
  'bicycle-theft': { day: 1.5, evening: 1.3, night: 0.8, morning: 0.9 },
  'drugs': { night: 1.4, evening: 1.3, day: 1.0, morning: 0.8 },
  'public-order': { night: 1.6, evening: 1.5, day: 0.9, morning: 0.6 },
  'possession-of-weapons': { night: 1.5, evening: 1.4, day: 1.0, morning: 0.7 },
  'criminal-damage-arson': { night: 1.6, evening: 1.2, day: 0.9, morning: 0.7 },
  'other-theft': { day: 1.3, evening: 1.2, night: 1.0, morning: 0.9 },
  'other-crime': { day: 1.0, night: 1.0, evening: 1.0, morning: 1.0 },
};

/**
 * Time bucket definitions (24-hour format)
 */
export enum TimeBucket {
  NIGHT = 'night',      // 00:00 - 06:00
  MORNING = 'morning',  // 06:00 - 12:00
  DAY = 'day',         // 12:00 - 18:00
  EVENING = 'evening',  // 18:00 - 24:00
}

/**
 * Get time bucket from hour (0-23)
 */
export function getTimeBucket(hour: number): TimeBucket {
  if (hour >= 0 && hour < 6) return TimeBucket.NIGHT;
  if (hour >= 6 && hour < 12) return TimeBucket.MORNING;
  if (hour >= 12 && hour < 18) return TimeBucket.DAY;
  return TimeBucket.EVENING;
}

/**
 * Get time weight for a crime category and time bucket
 */
export function getTimeWeight(
  categoryId: string,
  timeBucket: TimeBucket | string,
): number {
  const weights = CRIME_TIME_WEIGHTS[categoryId];
  if (!weights) return 1.0;
  return weights[timeBucket] || 1.0;
}
