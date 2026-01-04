/**
 * Unit tests for sunsetService.js
 * High-value tests only: time math with configurable threshold
 */

import { isNearSunset } from '../../js/modules/services/sunsetService.js';

// ========================================
// isNearSunset (time difference calculation)
// ========================================
describe('isNearSunset', () => {
  const sunset = new Date('2024-01-01T17:30:00');

  test('returns true when within default 2 hours after sunset', () => {
    const current = new Date('2024-01-01T18:30:00');
    expect(isNearSunset(current, sunset)).toBe(true);
  });

  test('returns true exactly at sunset', () => {
    const current = new Date('2024-01-01T17:30:00');
    expect(isNearSunset(current, sunset)).toBe(true);
  });

  test('returns false before sunset', () => {
    const current = new Date('2024-01-01T16:00:00');
    expect(isNearSunset(current, sunset)).toBe(false);
  });

  test('returns false when more than 2 hours after sunset', () => {
    const current = new Date('2024-01-01T20:00:00');
    expect(isNearSunset(current, sunset)).toBe(false);
  });

  test('respects custom hours parameter', () => {
    const current = new Date('2024-01-01T20:00:00');
    expect(isNearSunset(current, sunset, 3)).toBe(true);
    expect(isNearSunset(current, sunset, 2)).toBe(false);
  });

  test('boundary: exactly at threshold returns true', () => {
    const exactlyTwoHours = new Date('2024-01-01T19:30:00');
    expect(isNearSunset(exactlyTwoHours, sunset, 2)).toBe(true);
  });
});
