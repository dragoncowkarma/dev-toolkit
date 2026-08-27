import { describe, expect, it } from 'vitest';
import {
  decorateLines,
  deduplicateLines,
  joinLines,
  processLines,
  removeEmptyLines,
  reverseLines,
  sortLines,
  splitLines,
  trimLines,
} from './line.utils.js';

describe('line.utils', () => {
  describe('splitLines', () => {
    it('splits CRLF and LF correctly', () => {
      expect(splitLines('a\r\nb\nc')).toEqual(['a', 'b', 'c']);
    });

    it('returns empty array for empty input', () => {
      expect(splitLines('')).toEqual([]);
    });

    it('splits with custom delimiter when enabled', () => {
      expect(splitLines('apple,banana,cherry', ',', true)).toEqual(['apple', 'banana', 'cherry']);
    });
  });

  describe('trimLines & removeEmptyLines', () => {
    it('trims leading and trailing whitespace', () => {
      expect(trimLines(['  foo ', '\tbar\t'])).toEqual(['foo', 'bar']);
    });

    it('removes empty lines', () => {
      expect(removeEmptyLines(['a', '', 'b', ''])).toEqual(['a', 'b']);
    });
  });

  describe('deduplicateLines', () => {
    it('preserves first appearance order in case-sensitive mode', () => {
      const input = ['b', 'a', 'b', 'A', 'a'];
      const result = deduplicateLines(input, true);
      expect(result.lines).toEqual(['b', 'a', 'A']);
      expect(result.removedCount).toBe(2);
    });

    it('handles case-insensitive deduplication', () => {
      const input = ['Apple', 'apple', 'BANANA', 'banana'];
      const result = deduplicateLines(input, false);
      expect(result.lines).toEqual(['Apple', 'BANANA']);
      expect(result.removedCount).toBe(2);
    });
  });

  describe('sortLines', () => {
    it('performs lexicographical sort', () => {
      expect(sortLines(['item10', 'item2', 'item1'], { sortMode: 'asc' })).toEqual([
        'item1',
        'item10',
        'item2',
      ]);
    });

    it('performs natural sort where item2 < item10', () => {
      expect(
        sortLines(['item10', 'item2', 'item1'], { sortMode: 'asc', naturalSort: true })
      ).toEqual(['item1', 'item2', 'item10']);
    });

    it('performs descending sort', () => {
      expect(
        sortLines(['b', 'a', 'c'], { sortMode: 'desc' })
      ).toEqual(['c', 'b', 'a']);
    });

    it('handles case-insensitive sorting', () => {
      expect(
        sortLines(['b', 'A', 'a'], { sortMode: 'asc', caseSensitive: false })
      ).toEqual(['A', 'a', 'b']);
    });
  });

  describe('reverseLines', () => {
    it('reverses array of lines', () => {
      expect(reverseLines(['1', '2', '3'])).toEqual(['3', '2', '1']);
    });
  });

  describe('decorateLines & joinLines', () => {
    it('adds line numbers with start number', () => {
      expect(
        decorateLines(['foo', 'bar'], { numberLines: true, startNumber: 10 })
      ).toEqual(['10. foo', '11. bar']);
    });

    it('adds line numbers starting at 0', () => {
      expect(
        decorateLines(['foo', 'bar'], { numberLines: true, startNumber: 0 })
      ).toEqual(['0. foo', '1. bar']);
    });

    it('adds prefix and suffix', () => {
      expect(
        decorateLines(['one', 'two'], { prefix: '<li>', suffix: '</li>' })
      ).toEqual(['<li>one</li>', '<li>two</li>']);
    });

    it('joins lines with custom delimiter', () => {
      expect(joinLines(['a', 'b', 'c'], ', ')).toBe('a, b, c');
    });
  });

  describe('processLines pipeline', () => {
    it('handles full pipeline correctly', () => {
      const rawInput = '  item10 \r\n item2 \r\n item2 \r\n  ';
      const result = processLines(rawInput, {
        trim: true,
        removeEmpty: true,
        dedupe: true,
        sortMode: 'asc',
        naturalSort: true,
        prefix: '[',
        suffix: ']',
        numberLines: true,
        startNumber: 1,
        joinDelimiter: '\n',
      });

      expect(result.originalLineCount).toBe(4);
      expect(result.removedDuplicatesCount).toBe(1);
      expect(result.outputLineCount).toBe(2);
      expect(result.output).toBe('1. [item2]\n2. [item10]');
    });

    it('returns zeroes for empty input', () => {
      const result = processLines('', {});
      expect(result.originalLineCount).toBe(0);
      expect(result.output).toBe('');
      expect(result.removedDuplicatesCount).toBe(0);
    });
  });
});
