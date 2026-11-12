import { describe, expect, it } from 'vitest';
import { decodeGeohash, encodeGeohash } from './geohash.utils.js';

const REFERENCE_COORDINATES = [
  { latitude: 42.6, longitude: -5.6, geohash: 'ezs42' },
  { latitude: 37.5665, longitude: 126.978, geohash: 'wydm9' },
  { latitude: -33.8688, longitude: 151.2093, geohash: 'r3gx2' },
];

describe('encodeGeohash and decodeGeohash', () => {
  it.each(REFERENCE_COORDINATES)('round-trips $geohash within the decoded error bounds', ({
    latitude,
    longitude,
    geohash,
  }) => {
    expect(encodeGeohash(latitude, longitude, 5)).toBe(geohash);

    const decoded = decodeGeohash(encodeGeohash(latitude, longitude, 9));
    expect(Math.abs(decoded.latitude - latitude)).toBeLessThanOrEqual(decoded.latitudeError);
    expect(Math.abs(decoded.longitude - longitude)).toBeLessThanOrEqual(decoded.longitudeError);
  });

  it('supports the minimum and maximum precision boundaries', () => {
    expect(encodeGeohash(37.5665, 126.978, 1)).toHaveLength(1);
    expect(encodeGeohash(37.5665, 126.978, 12)).toHaveLength(12);
  });

  it('uses the default precision of nine characters', () => {
    expect(encodeGeohash(37.5665, 126.978)).toHaveLength(9);
  });

  it('accepts upper-case geohash input', () => {
    expect(decodeGeohash('WYD')).toEqual(decodeGeohash('wyd'));
  });
});

describe('geohash input validation', () => {
  it.each([
    [-90.1, 0],
    [90.1, 0],
    [0, -180.1],
    [0, 180.1],
  ])('rejects out-of-range coordinates: %s, %s', (latitude, longitude) => {
    expect(() => encodeGeohash(latitude, longitude)).toThrow(RangeError);
  });

  it.each([0, 13, 2.5])('rejects unsupported precision: %s', (precision) => {
    expect(() => encodeGeohash(0, 0, precision)).toThrow(/Precision/);
  });

  it('rejects empty and invalid geohashes with clear errors', () => {
    expect(() => decodeGeohash('')).toThrow(/cannot be empty/i);
    expect(() => decodeGeohash('abc!')).toThrow(/Invalid geohash character/i);
    expect(() => decodeGeohash('a0i')).toThrow(/Invalid geohash character/i);
  });
});
