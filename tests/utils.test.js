/**
 * Unit tests for utils.js
 * High-value tests only: complex math and branching logic
 */

import {
  calculateDistance,
  createBoundingBox,
  formatDistance,
  formatDuration
} from '../js/modules/utils.js';

// ========================================
// calculateDistance (Haversine formula)
// ========================================
describe('calculateDistance', () => {
  test('returns 0 for same point', () => {
    const result = calculateDistance(37.7749, -122.4194, 37.7749, -122.4194);
    expect(result).toBe(0);
  });

  test('calculates distance between Union Square and Coit Tower (~1.1 miles)', () => {
    const result = calculateDistance(37.7879, -122.4074, 37.8024, -122.4058);
    expect(result).toBeGreaterThan(0.9);
    expect(result).toBeLessThan(1.3);
  });

  test('calculates distance between SF and LA (~380 miles)', () => {
    const result = calculateDistance(37.7749, -122.4194, 34.0522, -118.2437);
    expect(result).toBeGreaterThan(340);
    expect(result).toBeLessThan(400);
  });

  test('order of points does not matter', () => {
    const result1 = calculateDistance(37.7749, -122.4194, 34.0522, -118.2437);
    const result2 = calculateDistance(34.0522, -118.2437, 37.7749, -122.4194);
    expect(result1).toBeCloseTo(result2, 10);
  });
});

// ========================================
// createBoundingBox (lat/lng math)
// ========================================
describe('createBoundingBox', () => {
  test('creates bounding box centered around point', () => {
    const box = createBoundingBox(37.7749, -122.4194);

    expect(box.left).toBeLessThan(-122.4194);
    expect(box.right).toBeGreaterThan(-122.4194);
    expect(box.top).toBeGreaterThan(37.7749);
    expect(box.bottom).toBeLessThan(37.7749);
  });

  test('larger radius creates larger box', () => {
    const smallBox = createBoundingBox(37.7749, -122.4194, 10);
    const largeBox = createBoundingBox(37.7749, -122.4194, 100);

    const smallWidth = smallBox.right - smallBox.left;
    const largeWidth = largeBox.right - largeBox.left;

    expect(largeWidth).toBeGreaterThan(smallWidth);
  });
});

// ========================================
// formatDistance (3 threshold branches)
// ========================================
describe('formatDistance', () => {
  test('formats very short distances in feet (< 0.1 mi)', () => {
    expect(formatDistance(0.05)).toBe('264 ft');
  });

  test('formats medium distances with decimal (0.1-10 mi)', () => {
    expect(formatDistance(1.5)).toBe('1.5 mi');
  });

  test('formats long distances as whole numbers (10+ mi)', () => {
    expect(formatDistance(25.7)).toBe('26 mi');
  });

  test('boundary: exactly 0.1 miles', () => {
    expect(formatDistance(0.1)).toBe('0.1 mi');
  });

  test('boundary: exactly 10 miles', () => {
    expect(formatDistance(10)).toBe('10 mi');
  });
});

// ========================================
// formatDuration (4 branches)
// ========================================
describe('formatDuration', () => {
  test('formats under 1 minute in seconds', () => {
    expect(formatDuration(0.5)).toBe('30 sec');
  });

  test('formats under 60 minutes in minutes', () => {
    expect(formatDuration(45)).toBe('45 min');
  });

  test('formats hours with remaining minutes', () => {
    expect(formatDuration(90)).toBe('1 hr 30 min');
  });

  test('formats whole hours without minutes', () => {
    expect(formatDuration(120)).toBe('2 hr');
  });

  test('boundary: exactly 1 minute', () => {
    expect(formatDuration(1)).toBe('1 min');
  });

  test('boundary: exactly 60 minutes', () => {
    expect(formatDuration(60)).toBe('1 hr');
  });
});
