import { describe, expect, it } from 'vitest';
import { parseGeoJson, validateGeoJson } from './geojson.utils.js';

describe('validateGeoJson', () => {
  it('accepts a valid Point and computes its bounding box', () => {
    const result = validateGeoJson({ type: 'Point', coordinates: [127, 37.5] });

    expect(result.errors).toEqual([]);
    expect(result.summary).toEqual({
      geometryCounts: { Point: 1 },
      coordinateCount: 1,
      boundingBox: [127, 37.5, 127, 37.5],
    });
  });

  it('accepts a closed Polygon and includes every valid position in its bounding box', () => {
    const result = validateGeoJson({
      type: 'Polygon',
      coordinates: [[[126, 36], [128, 36], [128, 38], [126, 36]]],
    });

    expect(result.errors).toEqual([]);
    expect(result.summary.boundingBox).toEqual([126, 36, 128, 38]);
    expect(result.summary.coordinateCount).toBe(4);
  });

  it('inspects geometries nested in a FeatureCollection', () => {
    const result = validateGeoJson({
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: null, geometry: { type: 'Point', coordinates: [0, 0] } },
        { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[1, 2], [3, 4]] } },
      ],
    });

    expect(result.errors).toEqual([]);
    expect(result.summary.geometryCounts).toEqual({ Point: 1, LineString: 1 });
    expect(result.summary.boundingBox).toEqual([0, 0, 3, 4]);
  });

  it('reports invalid coordinate ranges with precise paths', () => {
    const result = validateGeoJson({ type: 'Point', coordinates: [181, -91] });

    expect(result.errors).toEqual([
      { path: 'coordinates[0]', message: 'Longitude must be a number between -180 and 180.' },
      { path: 'coordinates[1]', message: 'Latitude must be a number between -90 and 90.' },
    ]);
  });

  it('reports an unclosed polygon ring', () => {
    const result = validateGeoJson({
      type: 'Polygon',
      coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1]]],
    });

    expect(result.errors).toContainEqual({
      path: 'coordinates[0]',
      message: 'A polygon ring must be closed (first and last positions equal).',
    });
  });

  it('reports a missing type member', () => {
    const result = validateGeoJson({ coordinates: [0, 0] });

    expect(result.errors).toEqual([{ path: 'document', message: 'Missing required "type" member.' }]);
  });
});

describe('parseGeoJson', () => {
  it('reports invalid JSON with a line and column', () => {
    const result = parseGeoJson('{\n  "type":\n}');

    expect(result.error).toMatch(/^Invalid JSON at line \d+, column \d+\.$/);
  });
});
