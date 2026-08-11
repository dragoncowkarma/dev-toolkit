import { describe, expect, it } from 'vitest';
import {
  addStop,
  generateCssGradient,
  normalizeHexForPicker,
  removeStop,
  reorderStops,
  sortStopsByPosition,
  validateColor,
  validateGradientConfig,
  validatePosition,
  validateStops,
} from './cssGradient.utils.js';

describe('cssGradient.utils', () => {
  describe('validateColor', () => {
    it('validates hex color strings in 3, 4, 6, 8 digit formats', () => {
      expect(validateColor('#fff')).toBe(true);
      expect(validateColor('#ffff')).toBe(true);
      expect(validateColor('#6366f1')).toBe(true);
      expect(validateColor('#6366f1ff')).toBe(true);
      expect(validateColor('#123')).toBe(true);
    });

    it('validates rgb and rgba color strings', () => {
      expect(validateColor('rgb(255, 0, 128)')).toBe(true);
      expect(validateColor('rgba(255, 0, 128, 0.5)')).toBe(true);
      expect(validateColor('rgba(100%, 0%, 50%, 1)')).toBe(true);
      expect(validateColor('rgb(0 128 255 / 0.8)')).toBe(true);
    });

    it('validates hsl and hsla color strings', () => {
      expect(validateColor('hsl(240, 100%, 50%)')).toBe(true);
      expect(validateColor('hsla(180, 50%, 50%, 0.8)')).toBe(true);
    });

    it('validates named colors and transparent', () => {
      expect(validateColor('transparent')).toBe(true);
      expect(validateColor('red')).toBe(true);
      expect(validateColor('blue')).toBe(true);
    });

    it('rejects invalid color strings', () => {
      expect(validateColor('invalid-color')).toBe(false);
      expect(validateColor('#12')).toBe(false);
      expect(validateColor('#12345')).toBe(false);
      expect(validateColor('rgba(300, 0, 0, 1)')).toBe(false);
      expect(validateColor('rgba(0, 0, 0, 1.5)')).toBe(false);
      expect(validateColor('')).toBe(false);
      expect(validateColor(null)).toBe(false);
    });
  });

  describe('validatePosition', () => {
    it('validates numbers and strings between 0 and 100 inclusive', () => {
      expect(validatePosition(0)).toBe(true);
      expect(validatePosition(100)).toBe(true);
      expect(validatePosition(50)).toBe(true);
      expect(validatePosition('0')).toBe(true);
      expect(validatePosition('100')).toBe(true);
      expect(validatePosition('42.5')).toBe(true);
    });

    it('rejects positions outside 0 to 100 range or non-numbers', () => {
      expect(validatePosition(-1)).toBe(false);
      expect(validatePosition(101)).toBe(false);
      expect(validatePosition('invalid')).toBe(false);
      expect(validatePosition('')).toBe(false);
      expect(validatePosition(null)).toBe(false);
    });
  });

  describe('validateGradientConfig', () => {
    const validStops = [
      { color: '#ff0000', position: 0 },
      { color: '#0000ff', position: 100 },
    ];

    it('validates a correct linear configuration', () => {
      const res = validateGradientConfig({
        type: 'linear',
        angle: 90,
        stops: validStops,
      });
      expect(res.valid).toBe(true);
      expect(res.error).toBeNull();
    });

    it('rejects invalid gradient types or out-of-range angles', () => {
      const res1 = validateGradientConfig({
        type: 'unknown',
        stops: validStops,
      });
      expect(res1.valid).toBe(false);

      const res2 = validateGradientConfig({
        type: 'linear',
        angle: 400,
        stops: validStops,
      });
      expect(res2.valid).toBe(false);
    });
  });

  describe('validateStops', () => {
    it('accepts valid stops array with at least 2 stops', () => {
      const stops = [
        { color: '#ff0000', position: 0 },
        { color: '#0000ff', position: 100 },
      ];
      expect(validateStops(stops)).toEqual({ valid: true, error: null });
    });

    it('rejects fewer than 2 stops', () => {
      const stops = [{ color: '#ff0000', position: 0 }];
      const result = validateStops(stops);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('At least 2 color stops are required');
    });

    it('surfaces error for invalid stop color or position', () => {
      const invalidColorStops = [
        { color: '#ff0000', position: 0 },
        { color: 'not-a-color', position: 50 },
      ];
      const res1 = validateStops(invalidColorStops);
      expect(res1.valid).toBe(false);
      expect(res1.error).toContain('Invalid color value');

      const invalidPosStops = [
        { color: '#ff0000', position: 0 },
        { color: '#0000ff', position: 150 },
      ];
      const res2 = validateStops(invalidPosStops);
      expect(res2.valid).toBe(false);
      expect(res2.error).toContain('Position at stop 2 must be a number between 0% and 100%');
    });
  });

  describe('generateCssGradient', () => {
    const validStops = [
      { color: '#6366f1', position: 0 },
      { color: '#34d399', position: 100 },
    ];

    it('generates spec-valid linear-gradient CSS with angle', () => {
      const result = generateCssGradient({
        type: 'linear',
        angle: 45,
        stops: validStops,
      });

      expect(result.valid).toBe(true);
      expect(result.css).toBe('linear-gradient(45deg, #6366f1 0%, #34d399 100%)');
      expect(result.declaration).toBe(
        'background: linear-gradient(45deg, #6366f1 0%, #34d399 100%);'
      );
    });

    it('generates linear-gradient CSS with keyword direction', () => {
      const result = generateCssGradient({
        type: 'linear',
        useKeywordDirection: true,
        direction: 'to right',
        stops: validStops,
      });

      expect(result.valid).toBe(true);
      expect(result.css).toBe('linear-gradient(to right, #6366f1 0%, #34d399 100%)');
    });

    it('generates spec-valid radial-gradient CSS', () => {
      const result = generateCssGradient({
        type: 'radial',
        shape: 'ellipse',
        radialPosition: 'top left',
        stops: validStops,
      });

      expect(result.valid).toBe(true);
      expect(result.css).toBe('radial-gradient(ellipse at top left, #6366f1 0%, #34d399 100%)');
      expect(result.declaration).toBe(
        'background: radial-gradient(ellipse at top left, #6366f1 0%, #34d399 100%);'
      );
    });

    it('generates spec-valid conic-gradient CSS', () => {
      const result = generateCssGradient({
        type: 'conic',
        conicAngle: 90,
        conicPosition: 'center',
        stops: validStops,
      });

      expect(result.valid).toBe(true);
      expect(result.css).toBe('conic-gradient(from 90deg at center, #6366f1 0%, #34d399 100%)');
      expect(result.declaration).toBe(
        'background: conic-gradient(from 90deg at center, #6366f1 0%, #34d399 100%);'
      );
    });

    it('returns invalid status and error message on invalid input', () => {
      const result = generateCssGradient({
        type: 'linear',
        angle: 45,
        stops: [{ color: '#ff0000', position: 0 }],
      });

      expect(result.valid).toBe(false);
      expect(result.css).toBe('');
      expect(result.declaration).toBe('');
      expect(result.error).toBeTruthy();
    });
  });

  describe('stop manipulation utilities', () => {
    const initialStops = [
      { id: 's1', color: '#ff0000', position: 0 },
      { id: 's2', color: '#00ff00', position: 100 },
    ];

    it('adds a stop with default values', () => {
      const updated = addStop(initialStops);
      expect(updated.length).toBe(3);
      expect(updated[2].id).toBeTruthy();
      expect(updated[2].color).toBe('#818cf8');
    });

    it('removes a stop by id or index', () => {
      const remById = removeStop(initialStops, 's1');
      expect(remById.length).toBe(1);
      expect(remById[0].id).toBe('s2');

      const remByIdx = removeStop(initialStops, 1);
      expect(remByIdx.length).toBe(1);
      expect(remByIdx[0].id).toBe('s1');
    });

    it('reorders stops', () => {
      const reordered = reorderStops(initialStops, 0, 1);
      expect(reordered[0].id).toBe('s2');
      expect(reordered[1].id).toBe('s1');
    });

    it('sorts stops by position ascending', () => {
      const unsorted = [
        { id: 's1', color: '#fff', position: 80 },
        { id: 's2', color: '#000', position: 20 },
      ];
      const sorted = sortStopsByPosition(unsorted);
      expect(sorted[0].position).toBe(20);
      expect(sorted[1].position).toBe(80);
    });

    it('normalizes hex strings for color picker input', () => {
      expect(normalizeHexForPicker('#abc')).toBe('#aabbcc');
      expect(normalizeHexForPicker('#6366f1')).toBe('#6366f1');
      expect(normalizeHexForPicker('rgba(0,0,0,1)')).toBe('#000000');
    });
  });
});
