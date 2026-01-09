/**
 * Unit tests for geocodingService.js
 * High-value tests only: complex parsing logic
 */

import { parseNominatimResult } from '../../js/modules/services/geocodingService.js';

// ========================================
// parseNominatimResult (complex conditional parsing)
// ========================================
describe('parseNominatimResult', () => {
  test('parses basic address (not a place)', () => {
    const mockResult = {
      lat: '37.7749',
      lon: '-122.4194',
      display_name: '123 Main St, San Francisco, CA, USA',
      address: {
        house_number: '123',
        road: 'Main St',
        city: 'San Francisco',
        state: 'CA'
      },
      type: 'house',
      class: 'place'
    };

    const parsed = parseNominatimResult(mockResult);

    expect(parsed.lat).toBe(37.7749);
    expect(parsed.lng).toBe(-122.4194);
    expect(parsed.isPlace).toBe(false);
  });

  test('parses amenity as place with primaryName', () => {
    const mockResult = {
      lat: '37.7849',
      lon: '-122.4094',
      display_name: 'Starbucks, Market St, San Francisco, CA',
      address: {
        amenity: 'Starbucks',
        road: 'Market St',
        city: 'San Francisco'
      },
      type: 'cafe',
      class: 'amenity'
    };

    const parsed = parseNominatimResult(mockResult);

    expect(parsed.isPlace).toBe(true);
    expect(parsed.primaryName).toBe('Starbucks');
    expect(parsed.category).toBe('amenity');
  });

  test('parses shop as place', () => {
    const mockResult = {
      lat: '37.7800',
      lon: '-122.4100',
      display_name: 'Target, Mission St, San Francisco',
      address: {
        shop: 'Target',
        road: 'Mission St',
        city: 'San Francisco'
      },
      type: 'department_store',
      class: 'shop'
    };

    const parsed = parseNominatimResult(mockResult);

    expect(parsed.isPlace).toBe(true);
    expect(parsed.primaryName).toBe('Target');
  });

  test('parses tourism as place', () => {
    const mockResult = {
      lat: '37.8024',
      lon: '-122.4058',
      display_name: 'Coit Tower, Telegraph Hill, San Francisco',
      address: {
        tourism: 'Coit Tower',
        city: 'San Francisco'
      },
      type: 'attraction',
      class: 'tourism'
    };

    const parsed = parseNominatimResult(mockResult);

    expect(parsed.isPlace).toBe(true);
    expect(parsed.primaryName).toBe('Coit Tower');
  });

  test('uses name property when no specific type', () => {
    const mockResult = {
      lat: '37.7900',
      lon: '-122.4000',
      display_name: 'Union Square, San Francisco',
      name: 'Union Square',
      address: { city: 'San Francisco' },
      type: 'square',
      class: 'place'
    };

    const parsed = parseNominatimResult(mockResult);

    expect(parsed.isPlace).toBe(true);
    expect(parsed.primaryName).toBe('Union Square');
  });

  test('builds secondary address from street parts for POIs', () => {
    const mockResult = {
      lat: '37.7849',
      lon: '-122.4094',
      display_name: 'Cafe Roma, 123 Columbus Ave, San Francisco, CA',
      address: {
        amenity: 'Cafe Roma',
        house_number: '123',
        road: 'Columbus Ave',
        city: 'San Francisco',
        state: 'CA'
      },
      type: 'cafe',
      class: 'amenity'
    };

    const parsed = parseNominatimResult(mockResult);

    expect(parsed.secondaryAddress).toContain('123 Columbus Ave');
    expect(parsed.secondaryAddress).toContain('San Francisco');
  });

  test('handles missing address object gracefully', () => {
    const mockResult = {
      lat: '37.7749',
      lon: '-122.4194',
      display_name: 'Some Location',
      type: 'place',
      class: 'place'
    };

    const parsed = parseNominatimResult(mockResult);

    expect(parsed.lat).toBe(37.7749);
    expect(parsed.lng).toBe(-122.4194);
    expect(parsed.secondaryAddress).toBe('Some Location');
  });
});
