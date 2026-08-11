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

    it('validates previously missing named colors like indigo, coral, rebeccapurple', () => {
      expect(validateColor('indigo')).toBe(true);
      expect(validateColor('coral')).toBe(true);
      expect(validateColor('rebeccapurple')).toBe(true);
      expect(validateColor('aliceblue')).toBe(true);
      expect(validateColor('chartreuse')).toBe(true);
    });

    it('validates named colors, currentcolor, and transparent case-insensitively', () => {
      expect(validateColor('transparent')).toBe(true);
      expect(validateColor('TRANSPARENT')).toBe(true);
      expect(validateColor('currentColor')).toBe(true);
      expect(validateColor('CURRENTCOLOR')).toBe(true);
      expect(validateColor('REBECCAPURPLE')).toBe(true);
      expect(validateColor('CoRaL')).toBe(true);
    });

    it('validates all standard CSS named colors systematically for completeness', () => {
      const allKeywords = [
        'aliceblue', 'antiquewhite', 'aqua', 'aquamarine', 'azure',
        'beige', 'bisque', 'black', 'blanchedalmond', 'blue',
        'blueviolet', 'brown', 'burlywood', 'cadetblue', 'chartreuse',
        'chocolate', 'coral', 'cornflowerblue', 'cornsilk', 'crimson',
        'currentcolor', 'cyan', 'darkblue', 'darkcyan', 'darkgoldenrod',
        'darkgray', 'darkgreen', 'darkgrey', 'darkkhaki', 'darkmagenta',
        'darkolivegreen', 'darkorange', 'darkorchid', 'darkred', 'darksalmon',
        'darkseagreen', 'darkslateblue', 'darkslategray', 'darkslategrey', 'darkturquoise',
        'darkviolet', 'deeppink', 'deepskyblue', 'dimgray', 'dimgrey',
        'dodgerblue', 'firebrick', 'floralwhite', 'forestgreen', 'fuchsia',
        'gainsboro', 'ghostwhite', 'gold', 'goldenrod', 'gray',
        'green', 'greenyellow', 'grey', 'honeydew', 'hotpink',
        'indianred', 'indigo', 'ivory', 'khaki', 'lavender',
        'lavenderblush', 'lawngreen', 'lemonchiffon', 'lightblue', 'lightcoral',
        'lightcyan', 'lightgoldenrodyellow', 'lightgray', 'lightgreen', 'lightgrey',
        'lightpink', 'lightsalmon', 'lightseagreen', 'lightskyblue', 'lightslategray',
        'lightslategrey', 'lightsteelblue', 'lightyellow', 'lime', 'limegreen',
        'linen', 'magenta', 'maroon', 'mediumaquamarine', 'mediumblue',
        'mediumorchid', 'mediumpurple', 'mediumseagreen', 'mediumslateblue', 'mediumspringgreen',
        'mediumturquoise', 'mediumvioletred', 'midnightblue', 'mintcream', 'mistyrose',
        'moccasin', 'navajowhite', 'navy', 'oldlace', 'olive',
        'olivedrab', 'orange', 'orangered', 'orchid', 'palegoldenrod',
        'palegreen', 'paleturquoise', 'palevioletred', 'papayawhip', 'peachpuff',
        'peru', 'pink', 'plum', 'powderblue', 'purple',
        'rebeccapurple', 'red', 'rosybrown', 'royalblue', 'saddlebrown',
        'salmon', 'sandybrown', 'seagreen', 'seashell', 'sienna',
        'silver', 'skyblue', 'slateblue', 'slategray', 'slategrey',
        'snow', 'springgreen', 'steelblue', 'tan', 'teal',
        'thistle', 'tomato', 'transparent', 'turquoise', 'violet',
        'wheat', 'white', 'whitesmoke', 'yellow', 'yellowgreen',
      ];

      for (const kw of allKeywords) {
        expect(validateColor(kw)).toBe(true);
      }
    });

    it('rejects invalid color strings and unknown identifiers', () => {
      expect(validateColor('invalid-color')).toBe(false);
      expect(validateColor('not-a-color')).toBe(false);
      expect(validateColor('rebeccapurple-extra')).toBe(false);
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

  describe('addStop collision-free insertion', () => {
    it('yields position strictly between 0 and 100 when adding after [0, 100, 100]', () => {
      const repeatedStops = [
        { id: 's1', color: '#ff0000', position: 0 },
        { id: 's2', color: '#00ff00', position: 100 },
        { id: 's3', color: '#0000ff', position: 100 },
      ];
      const updated = addStop(repeatedStops);
      expect(updated.length).toBe(4);
      const newPos = updated[3].position;
      expect(newPos).toBe(50);
      expect(newPos).toBeGreaterThan(0);
      expect(newPos).toBeLessThan(100);
    });

    it('selects largest interval correctly for unsorted stops', () => {
      const unsortedStops = [
        { id: 's1', color: '#fff', position: 100 },
        { id: 's2', color: '#000', position: 0 },
        { id: 's3', color: '#888', position: 80 },
      ];
      const updated = addStop(unsortedStops);
      expect(updated[3].position).toBe(40);
    });

    it('applies stable tie-breaking when multiple max-width intervals exist', () => {
      const tieStops = [
        { id: 's1', color: '#111', position: 0 },
        { id: 's2', color: '#222', position: 50 },
        { id: 's3', color: '#333', position: 100 },
      ];
      const updated = addStop(tieStops);
      expect(updated[3].position).toBe(25);
    });

    it('uses fallback position when all valid stop positions are identical', () => {
      const all100Stops = [
        { id: 's1', color: '#ff0000', position: 100 },
        { id: 's2', color: '#00ff00', position: 100 },
      ];
      const updated100 = addStop(all100Stops);
      expect(updated100[2].position).toBe(50);

      const all50Stops = [
        { id: 's1', color: '#ff0000', position: 50 },
        { id: 's2', color: '#00ff00', position: 50 },
      ];
      const updated50 = addStop(all50Stops);
      expect(updated50[2].position).toBe(100);

      const all0Stops = [
        { id: 's1', color: '#ff0000', position: 0 },
        { id: 's2', color: '#00ff00', position: 0 },
      ];
      const updated0 = addStop(all0Stops);
      expect(updated0[2].position).toBe(100);
    });

    it('uses fallback position when no valid positions exist or stops array is empty', () => {
      const emptyUpdated = addStop([]);
      expect(emptyUpdated.length).toBe(1);
      expect(emptyUpdated[0].position).toBe(50);

      const invalidStops = [{ id: 's1', color: 'red', position: 'invalid' }];
      const invalidUpdated = addStop(invalidStops);
      expect(invalidUpdated.length).toBe(2);
      expect(invalidUpdated[1].position).toBe(50);
    });

    it('guarantees position is strictly inside small integer intervals', () => {
      const smallInterval = [
        { id: 's1', color: '#111', position: 50 },
        { id: 's2', color: '#222', position: 51 },
      ];
      const updated = addStop(smallInterval);
      expect(updated[2].position).toBe(50.5);
    });

    it('preserves existing stops and their relative order', () => {
      const initialStops = [
        { id: 's1', color: '#ff0000', position: 100 },
        { id: 's2', color: '#00ff00', position: 0 },
      ];
      const updated = addStop(initialStops);
      expect(updated[0]).toEqual(initialStops[0]);
      expect(updated[1]).toEqual(initialStops[1]);
      expect(updated.length).toBe(3);
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
