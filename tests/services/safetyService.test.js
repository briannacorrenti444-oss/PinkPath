/**
 * Unit tests for safetyService.js
 * High-value tests only: complex logic and critical thresholds
 */

import {
  scoreRouteComplexity,
  scoreRoadType,
  getSafetyLabel,
  getSafetyColor
} from '../../js/modules/services/safetyService.js';

// ========================================
// scoreRouteComplexity (instruction filtering logic)
// ========================================
describe('scoreRouteComplexity', () => {
  test('scores simple route (0-3 turns) as 100', () => {
    const route = {
      instructions: [
        { type: 'Head' },
        { type: 'Left' },
        { type: 'Right' },
        { type: 'Arrive' }
      ]
    };
    expect(scoreRouteComplexity(route)).toBe(100);
  });

  test('scores moderate route (4-7 turns) as 80', () => {
    const route = {
      instructions: [
        { type: 'Head' },
        { type: 'Left' },
        { type: 'Right' },
        { type: 'Left' },
        { type: 'Right' },
        { type: 'Left' },
        { type: 'Arrive' }
      ]
    };
    expect(scoreRouteComplexity(route)).toBe(80);
  });

  test('does not count Head, Continue, Arrive as turns', () => {
    const route = {
      instructions: [
        { type: 'Head' },
        { type: 'Continue' },
        { type: 'Continue' },
        { type: 'Continue' },
        { type: 'Arrive' }
      ]
    };
    expect(scoreRouteComplexity(route)).toBe(100);
  });

  test('handles missing instructions property', () => {
    const route = {};
    expect(scoreRouteComplexity(route)).toBe(100);
  });
});

// ========================================
// scoreRoadType (regex matching + percentage)
// ========================================
describe('scoreRoadType', () => {
  test('scores all major roads as 100', () => {
    const route = {
      instructions: [
        { road: 'Market Street' },
        { road: 'Van Ness Avenue' },
        { road: 'Geary Boulevard' }
      ]
    };
    expect(scoreRoadType(route)).toBe(100);
  });

  test('recognizes various road type keywords', () => {
    const route = {
      instructions: [
        { road: 'First Avenue' },
        { road: 'Main Boulevard' },
        { road: 'US Highway 101' },
        { road: 'Oak Street' },
        { road: 'Pacific Drive' },
        { road: 'Sunset Way' },
        { road: 'Golden Gate Parkway' }
      ]
    };
    expect(scoreRoadType(route)).toBe(100);
  });

  test('scores few major roads (< 40%) as 50', () => {
    const route = {
      instructions: [
        { road: 'Market Street' },
        { road: '' },
        { road: '' },
        { road: '' },
        { road: '' }
      ]
    };
    expect(scoreRoadType(route)).toBe(50);
  });

  test('uses name property if road is missing', () => {
    const route = {
      instructions: [
        { name: 'Market Street' },
        { name: 'Van Ness Avenue' }
      ]
    };
    expect(scoreRoadType(route)).toBe(100);
  });
});

// ========================================
// getSafetyLabel (critical thresholds)
// ========================================
describe('getSafetyLabel', () => {
  test('returns correct labels for each range', () => {
    expect(getSafetyLabel(9.0)).toBe('Excellent');
    expect(getSafetyLabel(7.5)).toBe('Good');
    expect(getSafetyLabel(6.0)).toBe('Fair');
    expect(getSafetyLabel(3.0)).toBe('Caution');
  });

  test('boundary: 8.5 is Excellent, 8.49 is Good', () => {
    expect(getSafetyLabel(8.5)).toBe('Excellent');
    expect(getSafetyLabel(8.49)).toBe('Good');
  });

  test('boundary: 7.0 is Good, 6.99 is Fair', () => {
    expect(getSafetyLabel(7.0)).toBe('Good');
    expect(getSafetyLabel(6.99)).toBe('Fair');
  });

  test('boundary: 5.0 is Fair, 4.99 is Caution', () => {
    expect(getSafetyLabel(5.0)).toBe('Fair');
    expect(getSafetyLabel(4.99)).toBe('Caution');
  });

  test('handles string scores', () => {
    expect(getSafetyLabel('8.5')).toBe('Excellent');
    expect(getSafetyLabel('4.0')).toBe('Caution');
  });
});

// ========================================
// getSafetyColor (must match label thresholds)
// ========================================
describe('getSafetyColor', () => {
  test('returns correct colors for each range', () => {
    expect(getSafetyColor(9.0)).toBe('excellent');
    expect(getSafetyColor(7.5)).toBe('good');
    expect(getSafetyColor(6.0)).toBe('fair');
    expect(getSafetyColor(3.0)).toBe('caution');
  });

  test('color thresholds match label thresholds', () => {
    const testScores = [10, 8.5, 8.49, 7.0, 6.99, 5.0, 4.99, 0];

    testScores.forEach(score => {
      const label = getSafetyLabel(score).toLowerCase();
      const color = getSafetyColor(score);
      expect(color).toBe(label);
    });
  });
});
