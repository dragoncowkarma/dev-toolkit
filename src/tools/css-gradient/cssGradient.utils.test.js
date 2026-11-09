import { describe, expect, it } from 'vitest';
import {
  DEFAULT_STOPS,
  addStop,
  calculateInteriorMidpoint,
  findLargestSelectableInterval,
  generateCssGradient,
  isIntervalSelectable,
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

    it('rounds repeating-decimal stop positions in CSS and declarations', () => {
      const result = generateCssGradient({
        type: 'linear',
        angle: 90,
        stops: [
          { color: '#f43f5e', position: 0 },
          { color: '#eab308', position: 100 / 3 },
          { color: '#06b6d4', position: (100 / 3) * 2 },
        ],
      });

      expect(result.css).toBe(
        'linear-gradient(90deg, #f43f5e 0%, #eab308 33.33%, #06b6d4 66.67%)'
      );
      expect(result.declaration).toBe(`background: ${result.css};`);
    });

    it('removes trailing floating-point noise from stop positions', () => {
      const result = generateCssGradient({
        type: 'linear',
        angle: 90,
        stops: [
          { color: '#f43f5e', position: 0.1 + 0.2 },
          { color: '#06b6d4', position: 100 },
        ],
      });

      expect(result.css).toBe('linear-gradient(90deg, #f43f5e 0.3%, #06b6d4 100%)');
    });

    it('keeps clean positions free of trailing decimal zeros', () => {
      const result = generateCssGradient({
        type: 'linear',
        angle: 90,
        stops: [
          { color: '#f43f5e', position: 0 },
          { color: '#eab308', position: 33 },
          { color: '#06b6d4', position: 50.3 },
          { color: '#f43f5e', position: 100 },
        ],
      });

      expect(result.css).toBe(
        'linear-gradient(90deg, #f43f5e 0%, #eab308 33%, #06b6d4 50.3%, #f43f5e 100%)'
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
    it('inserts new stop at index 1 between 0 and 100 when adding to [0, 100, 100]', () => {
      const repeatedStops = [
        { id: 's1', color: '#ff0000', position: 0 },
        { id: 's2', color: '#00ff00', position: 100 },
        { id: 's3', color: '#0000ff', position: 100 },
      ];
      const updated = addStop(repeatedStops);
      expect(updated.length).toBe(4);
      // Spliced at index 1 after stop 1 (pos 0), not appended at array end
      expect(updated[1].position).toBe(50);
      expect(updated[1].color).toBe('#818cf8');
      expect(updated[1].position).toBeGreaterThan(0);
      expect(updated[1].position).toBeLessThan(100);
      // Existing stops preserve their relative order
      expect(updated[0].id).toBe('s1');
      expect(updated[2].id).toBe('s2');
      expect(updated[3].id).toBe('s3');
    });

    it('generates CSS gradient with ascending stops after adding to DEFAULT_STOPS', () => {
      const updated = addStop(DEFAULT_STOPS);
      expect(updated.length).toBe(4);
      expect(updated.map((s) => Number(s.position))).toEqual([0, 25, 50, 100]);
      const gradient = generateCssGradient({
        type: 'linear',
        angle: 90,
        stops: updated,
      });
      expect(gradient.valid).toBe(true);
      expect(gradient.css).toBe(
        'linear-gradient(90deg, #6366f1 0%, #818cf8 25%, #a78bfa 50%, #34d399 100%)'
      );
    });

    it('selects largest interval correctly for unsorted stops', () => {
      const unsortedStops = [
        { id: 's1', color: '#fff', position: 100 },
        { id: 's2', color: '#000', position: 0 },
        { id: 's3', color: '#888', position: 80 },
      ];
      const updated = addStop(unsortedStops);
      // Largest interval is [0, 80] with midpoint 40; spliced after s2 (pos 0) at index 2
      expect(updated[2].position).toBe(40);
      expect(updated.map((s) => s.id)).toEqual(['s1', 's2', updated[2].id, 's3']);
    });

    it('applies stable tie-breaking when multiple max-width intervals exist', () => {
      const tieStops = [
        { id: 's1', color: '#111', position: 0 },
        { id: 's2', color: '#222', position: 50 },
        { id: 's3', color: '#333', position: 100 },
      ];
      const updated = addStop(tieStops);
      // First max-width interval [0, 50] chosen; midpoint 25 spliced after s1 at index 1
      expect(updated[1].position).toBe(25);
      expect(updated.map((s) => s.id)).toEqual(['s1', updated[1].id, 's2', 's3']);
    });

    it('uses fallback position when all valid stop positions are identical', () => {
      const all100Stops = [
        { id: 's1', color: '#ff0000', position: 100 },
        { id: 's2', color: '#00ff00', position: 100 },
      ];
      const updated100 = addStop(all100Stops);
      // All valid positions are 100, fallback is 50, spliced before 100 at index 0
      expect(updated100[0].position).toBe(50);
      expect(updated100[1].id).toBe('s1');
      expect(updated100[2].id).toBe('s2');

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
      expect(updated[1].position).toBe(50.5);
    });

    it('places position strictly inside narrow intervals without endpoint duplication', () => {
      const cases = [
        {
          stops: [
            { id: 's1', color: '#111', position: 99.99 },
            { id: 's2', color: '#222', position: 100 },
          ],
          start: 99.99,
          end: 100,
        },
        {
          stops: [
            { id: 's1', color: '#111', position: 12.5 },
            { id: 's2', color: '#222', position: 12.51 },
          ],
          start: 12.5,
          end: 12.51,
        },
        {
          stops: [
            { id: 's1', color: '#111', position: 0 },
            { id: 's2', color: '#222', position: 0.001 },
            { id: 's3', color: '#333', position: 0.002 },
          ],
          start: 0,
          end: 0.001,
        },
      ];

      for (const { stops, start, end } of cases) {
        const updated = addStop(stops);
        const newStop = updated.find((s) => !stops.some((orig) => orig.id === s.id));
        expect(newStop).toBeDefined();
        const newPos = newStop.position;
        expect(newPos).toBeGreaterThan(start);
        expect(newPos).toBeLessThan(end);
        for (const stop of stops) {
          expect(newPos).not.toBe(stop.position);
        }
      }
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

    it('handles IEEE-754 limit [99.99999999999999, 100] without duplicating endpoints', () => {
      const limitStops = [
        { id: 's1', color: '#111', position: 99.99999999999999 },
        { id: 's2', color: '#222', position: 100 },
      ];
      const updated = addStop(limitStops);
      expect(updated.length).toBe(3);

      const newStop = updated.find((s) => s.id !== 's1' && s.id !== 's2');
      expect(newStop).toBeDefined();
      expect(newStop.position).not.toBe(99.99999999999999);
      expect(newStop.position).not.toBe(100);
      expect(newStop.position).toBe(50);

      // Spliced at index 0 because 50 is less than both existing stop positions
      expect(updated[0].id).toBe(newStop.id);
      expect(updated[1].id).toBe('s1');
      expect(updated[2].id).toBe('s2');
      expect(validatePosition(newStop.position)).toBe(true);
    });

    it('handles IEEE-754 limit [0.1, 0.10000000000000002] without duplicating endpoints', () => {
      const limitStops = [
        { id: 's1', color: '#111', position: 0.1 },
        { id: 's2', color: '#222', position: 0.10000000000000002 },
      ];
      const updated = addStop(limitStops);
      expect(updated.length).toBe(3);

      const newStop = updated.find((s) => s.id !== 's1' && s.id !== 's2');
      expect(newStop).toBeDefined();
      expect(newStop.position).not.toBe(0.1);
      expect(newStop.position).not.toBe(0.10000000000000002);
      expect(newStop.position).toBe(100);

      // Spliced at index 2 after s2 (both 0.1 and 0.10000000000000002 <= 100)
      expect(updated[0].id).toBe('s1');
      expect(updated[1].id).toBe('s2');
      expect(updated[2].id).toBe(newStop.id);
      expect(validatePosition(newStop.position)).toBe(true);
    });

    it('skips non-representable largest interval for next-largest selectable one', () => {
      const nonRepresentableWidth = 100 - 99.99999999999999; // 1.4210854715202004e-14
      const smallerSelectableWidth = 1e-14; // 1e-14 < 1.4210854715202004e-14
      expect(nonRepresentableWidth).toBeGreaterThan(smallerSelectableWidth);

      const intervals = [
        { start: 99.99999999999999, end: 100, width: nonRepresentableWidth },
        { start: 0, end: 1e-14, width: smallerSelectableWidth },
      ];
      const chosen = findLargestSelectableInterval(intervals);
      expect(chosen).toEqual({
        start: 0,
        end: 1e-14,
        width: smallerSelectableWidth,
      });

      const interiorPos = calculateInteriorMidpoint(chosen.start, chosen.end);
      expect(interiorPos).toBeGreaterThan(0);
      expect(interiorPos).toBeLessThan(1e-14);
    });

    it('breaks width ties by selecting the lower start interval regardless of order', () => {
      const reversedIntervals = [
        { start: 50, end: 100, width: 50 },
        { start: 0, end: 50, width: 50 },
      ];
      const chosen = findLargestSelectableInterval(reversedIntervals);
      expect(chosen).toEqual({
        start: 0,
        end: 50,
        width: 50,
      });
    });

    it('selects selectable interval when non-representable intervals coexist in stops', () => {
      const mixedStops = [
        { id: 's1', color: '#111', position: 0 },
        { id: 's2', color: '#222', position: 50 },
        { id: 's3', color: '#333', position: 99.99999999999999 },
        { id: 's4', color: '#444', position: 100 },
      ];
      const updated = addStop(mixedStops);
      expect(updated.length).toBe(5);

      const newStop = updated.find((s) => !mixedStops.some((orig) => orig.id === s.id));
      expect(newStop).toBeDefined();
      // Largest selectable interval is [0, 50], midpoint 25
      expect(newStop.position).toBe(25);
      expect(updated.map((s) => s.id)).toEqual(['s1', newStop.id, 's2', 's3', 's4']);
    });

    it('uses deterministic in-range fallback when candidate positions are already present', () => {
      const existing = new Set([100, 50, 0, 75]);
      const candidates = [100, 50, 0, 75, 25];
      const nextCandidate = candidates.find((c) => !existing.has(c));
      expect(nextCandidate).toBe(25);

      // Verify addStop fallback chooses 50 when 100 is already present in repeated stops
      const all100 = [{ id: 's1', position: 100 }, { id: 's2', position: 100 }];
      const updated100 = addStop(all100);
      expect(updated100[0].position).toBe(50);
    });

    it('does not throw for null, malformed, repeated, or boundary-only stop inputs', () => {
      expect(() => addStop(null)).not.toThrow();
      expect(() => addStop(undefined)).not.toThrow();
      expect(() => addStop('not-an-array')).not.toThrow();
      expect(() => addStop([null, undefined, {}])).not.toThrow();

      const nullUpdated = addStop(null);
      expect(nullUpdated.length).toBe(1);
      expect(nullUpdated[0].position).toBe(50);

      const repeatedBoundary0 = [
        { id: 'b1', position: 0 },
        { id: 'b2', position: 0 },
      ];
      const updatedB0 = addStop(repeatedBoundary0);
      expect(updatedB0.length).toBe(3);
      expect(updatedB0[2].position).toBe(100);

      const repeatedBoundary100 = [
        { id: 'b1', position: 100 },
        { id: 'b2', position: 100 },
      ];
      const updatedB100 = addStop(repeatedBoundary100);
      expect(updatedB100.length).toBe(3);
      expect(updatedB100[0].position).toBe(50);
    });

    it('does not mutate caller-owned stop arrays', () => {
      const originalStops = Object.freeze([
        Object.freeze({ id: 's1', color: '#ff0000', position: 10 }),
        Object.freeze({ id: 's2', color: '#00ff00', position: 90 }),
      ]);
      const updated = addStop(originalStops);
      expect(updated.length).toBe(3);
      expect(originalStops.length).toBe(2);
      expect(originalStops[0].position).toBe(10);
      expect(originalStops[1].position).toBe(90);
    });

    it('validates selectable status via isIntervalSelectable correctly', () => {
      expect(isIntervalSelectable(99.99999999999999, 100)).toBe(false);
      expect(isIntervalSelectable(0.1, 0.10000000000000002)).toBe(false);
      expect(isIntervalSelectable(50, 50)).toBe(false);
      expect(isIntervalSelectable(100, 0)).toBe(false);
      expect(isIntervalSelectable(null, 50)).toBe(false);
      expect(isIntervalSelectable(0, NaN)).toBe(false);
      expect(isIntervalSelectable(0, 100)).toBe(true);
      expect(isIntervalSelectable(0, 1e-14)).toBe(true);
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
      expect(updated[1].id).toBeTruthy();
      expect(updated[1].color).toBe('#818cf8');
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
