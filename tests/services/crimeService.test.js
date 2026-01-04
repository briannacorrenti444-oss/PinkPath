/**
 * Unit tests for crimeService.js
 * High-value tests only: complex logic, date math, scoring algorithms
 */

import {
  isInSanFrancisco,
  filterCrimesLast30Days,
  groupCrimesByType,
  scoreCrimeData,
  analyzeDayNightCrimes,
  filterRecentViolentCrimes
} from '../../js/modules/services/crimeService.js';

// ========================================
// isInSanFrancisco (boundary box logic)
// ========================================
describe('isInSanFrancisco', () => {
  test('returns true for downtown SF', () => {
    expect(isInSanFrancisco(37.7749, -122.4194)).toBe(true);
  });

  test('returns true for Golden Gate Park', () => {
    expect(isInSanFrancisco(37.7694, -122.4862)).toBe(true);
  });

  test('returns false for Oakland', () => {
    expect(isInSanFrancisco(37.8044, -122.2712)).toBe(false);
  });

  test('returns false for Los Angeles', () => {
    expect(isInSanFrancisco(34.0522, -118.2437)).toBe(false);
  });
});

// ========================================
// filterCrimesLast30Days (date math)
// ========================================
describe('filterCrimesLast30Days', () => {
  test('returns empty array for null/empty input', () => {
    expect(filterCrimesLast30Days(null)).toEqual([]);
    expect(filterCrimesLast30Days([])).toEqual([]);
  });

  test('filters out crimes older than 30 days', () => {
    const now = new Date();
    const recentDate = new Date(now);
    recentDate.setDate(now.getDate() - 10);
    const oldDate = new Date(now);
    oldDate.setDate(now.getDate() - 60);

    const crimes = [
      { incident_datetime: recentDate.toISOString(), incident_category: 'Theft' },
      { incident_datetime: oldDate.toISOString(), incident_category: 'Assault' }
    ];

    const filtered = filterCrimesLast30Days(crimes);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].incident_category).toBe('Theft');
  });

  test('keeps crimes within last 30 days', () => {
    const now = new Date();
    const date1 = new Date(now);
    date1.setDate(now.getDate() - 5);
    const date2 = new Date(now);
    date2.setDate(now.getDate() - 25);

    const crimes = [
      { incident_datetime: date1.toISOString(), incident_category: 'Theft' },
      { incident_datetime: date2.toISOString(), incident_category: 'Assault' }
    ];

    const filtered = filterCrimesLast30Days(crimes);
    expect(filtered).toHaveLength(2);
  });
});

// ========================================
// groupCrimesByType (grouping + sorting)
// ========================================
describe('groupCrimesByType', () => {
  test('groups crimes by category', () => {
    const crimes = [
      { incident_category: 'Theft' },
      { incident_category: 'Theft' },
      { incident_category: 'Assault' }
    ];

    const grouped = groupCrimesByType(crimes);
    expect(grouped['Theft']).toBe(2);
    expect(grouped['Assault']).toBe(1);
  });

  test('sorts by count descending', () => {
    const crimes = [
      { incident_category: 'Assault' },
      { incident_category: 'Theft' },
      { incident_category: 'Theft' },
      { incident_category: 'Theft' },
      { incident_category: 'Robbery' },
      { incident_category: 'Robbery' }
    ];

    const grouped = groupCrimesByType(crimes);
    const keys = Object.keys(grouped);

    expect(keys[0]).toBe('Theft');
    expect(keys[1]).toBe('Robbery');
    expect(keys[2]).toBe('Assault');
  });
});

// ========================================
// scoreCrimeData (complex scoring algorithm)
// ========================================
describe('scoreCrimeData', () => {
  test('returns 100 for no crimes', () => {
    const result = scoreCrimeData([], 1.0, 12);
    expect(result.score).toBe(100);
    expect(result.totalCrimes).toBe(0);
  });

  test('counts crimes by severity', () => {
    const crimes = [
      { incident_category: 'Homicide', incident_datetime: new Date().toISOString() },
      { incident_category: 'Robbery', incident_datetime: new Date().toISOString() },
      { incident_category: 'Larceny Theft', incident_datetime: new Date().toISOString() }
    ];

    const result = scoreCrimeData(crimes, 1.0, 12);
    expect(result.highSeverity).toBe(2);
    expect(result.lowSeverity).toBe(1);
    expect(result.totalCrimes).toBe(3);
  });

  test('score decreases with more crimes', () => {
    const fewCrimes = [
      { incident_category: 'Larceny Theft', incident_datetime: new Date().toISOString() }
    ];

    const manyCrimes = Array(20).fill({
      incident_category: 'Larceny Theft',
      incident_datetime: new Date().toISOString()
    });

    const fewResult = scoreCrimeData(fewCrimes, 1.0, 12);
    const manyResult = scoreCrimeData(manyCrimes, 1.0, 12);

    expect(fewResult.score).toBeGreaterThan(manyResult.score);
  });

  test('same crimes over longer route = higher score', () => {
    const crimes = Array(10).fill({
      incident_category: 'Larceny Theft',
      incident_datetime: new Date().toISOString()
    });

    const shortRoute = scoreCrimeData(crimes, 0.5, 12);
    const longRoute = scoreCrimeData(crimes, 5.0, 12);

    expect(longRoute.score).toBeGreaterThan(shortRoute.score);
  });

  test('uses relative scoring when baseline provided', () => {
    const crimes = Array(5).fill({
      incident_category: 'Larceny Theft',
      incident_datetime: new Date().toISOString()
    });

    const baseline = {
      totalCrimes: 100,
      density: 50,
      weightedDensity: 75
    };

    const result = scoreCrimeData(crimes, 1.0, 12, baseline);
    expect(result.comparisonText).not.toBe('Absolute scoring (no baseline)');
  });
});

// ========================================
// analyzeDayNightCrimes (rate calculation)
// ========================================
describe('analyzeDayNightCrimes', () => {
  const mockSunData = {
    sunrise: new Date('2024-01-01T07:00:00'),
    sunset: new Date('2024-01-01T17:00:00')
  };

  test('returns zeros for null/empty input', () => {
    expect(analyzeDayNightCrimes(null, mockSunData).daytimeCrimes).toBe(0);
    expect(analyzeDayNightCrimes([], mockSunData).nighttimeCrimes).toBe(0);
  });

  test('correctly splits day vs night crimes', () => {
    const crimes = [
      { incident_datetime: '2024-01-01T10:00:00' },
      { incident_datetime: '2024-01-01T14:00:00' },
      { incident_datetime: '2024-01-01T22:00:00' },
      { incident_datetime: '2024-01-01T03:00:00' }
    ];

    const result = analyzeDayNightCrimes(crimes, mockSunData);
    expect(result.daytimeCrimes).toBe(2);
    expect(result.nighttimeCrimes).toBe(2);
  });

  test('calculates nighttime increase percentage', () => {
    const crimes = [
      { incident_datetime: '2024-01-01T10:00:00' },
      { incident_datetime: '2024-01-01T20:00:00' },
      { incident_datetime: '2024-01-01T22:00:00' },
      { incident_datetime: '2024-01-01T02:00:00' },
      { incident_datetime: '2024-01-01T05:00:00' }
    ];

    const result = analyzeDayNightCrimes(crimes, mockSunData);
    expect(result.nighttimeIncreasePercent).toBeGreaterThan(0);
  });
});

// ========================================
// filterRecentViolentCrimes (date + category)
// ========================================
describe('filterRecentViolentCrimes', () => {
  test('returns empty for null/empty input', () => {
    expect(filterRecentViolentCrimes(null)).toEqual([]);
    expect(filterRecentViolentCrimes([])).toEqual([]);
  });

  test('filters to last 7 days only', () => {
    const now = new Date();
    const recent = new Date(now);
    recent.setDate(now.getDate() - 3);
    const old = new Date(now);
    old.setDate(now.getDate() - 20);

    const crimes = [
      { incident_datetime: recent.toISOString(), incident_category: 'Assault' },
      { incident_datetime: old.toISOString(), incident_category: 'Assault' }
    ];

    const filtered = filterRecentViolentCrimes(crimes);
    expect(filtered).toHaveLength(1);
  });

  test('includes violent crimes and marks isViolent true', () => {
    const now = new Date();
    const crimes = [
      { incident_datetime: now.toISOString(), incident_category: 'Homicide' },
      { incident_datetime: now.toISOString(), incident_category: 'Assault' },
      { incident_datetime: now.toISOString(), incident_category: 'Robbery' }
    ];

    const filtered = filterRecentViolentCrimes(crimes);
    expect(filtered).toHaveLength(3);
    filtered.forEach(crime => {
      expect(crime.isViolent).toBe(true);
    });
  });

  test('includes theft crimes and marks isViolent false', () => {
    const now = new Date();
    const crimes = [
      { incident_datetime: now.toISOString(), incident_category: 'Burglary' },
      { incident_datetime: now.toISOString(), incident_category: 'Larceny Theft' }
    ];

    const filtered = filterRecentViolentCrimes(crimes);
    expect(filtered).toHaveLength(2);
    filtered.forEach(crime => {
      expect(crime.isViolent).toBe(false);
    });
  });

  test('excludes non-violent/non-theft categories', () => {
    const now = new Date();
    const crimes = [
      { incident_datetime: now.toISOString(), incident_category: 'Vandalism' },
      { incident_datetime: now.toISOString(), incident_category: 'Drug Offense' },
      { incident_datetime: now.toISOString(), incident_category: 'Fraud' }
    ];

    const filtered = filterRecentViolentCrimes(crimes);
    expect(filtered).toHaveLength(0);
  });
});
