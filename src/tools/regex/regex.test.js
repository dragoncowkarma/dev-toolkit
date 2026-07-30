import { describe, it, expect } from 'vitest';
import { runRegex, REGEX_PRESETS } from './regex.utils';

describe('Regex Utilities - runRegex', () => {
  it('should return empty matches when pattern is empty', () => {
    const result = runRegex('', 'g', 'Hello World');
    expect(result.isValid).toBe(true);
    expect(result.matches).toHaveLength(0);
    expect(result.segments).toHaveLength(1);
    expect(result.segments[0]).toEqual({ type: 'text', text: 'Hello World' });
  });

  it('should return invalid status and error message on invalid regex pattern', () => {
    const result = runRegex('[a-z', 'g', 'Hello');
    expect(result.isValid).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.matches).toHaveLength(0);
  });

  it('should find global matches with "g" flag', () => {
    const result = runRegex('l+', 'g', 'hello world');
    expect(result.isValid).toBe(true);
    expect(result.matches).toHaveLength(2);

    expect(result.matches[0]).toEqual({
      index: 2,
      length: 2,
      text: 'll',
      groups: [],
      namedGroups: {}
    });

    expect(result.matches[1]).toEqual({
      index: 9,
      length: 1,
      text: 'l',
      groups: [],
      namedGroups: {}
    });
  });

  it('should find only first match without "g" flag', () => {
    const result = runRegex('l+', '', 'hello world');
    expect(result.isValid).toBe(true);
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].index).toBe(2);
  });

  it('should support case-insensitive matching with "i" flag', () => {
    const result = runRegex('hello', 'i', 'Hello World');
    expect(result.isValid).toBe(true);
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].text).toBe('Hello');
  });

  it('should handle zero-width matches without infinite loops', () => {
    const result = runRegex('^', 'g', 'abc');
    expect(result.isValid).toBe(true);
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]).toEqual({
      index: 0,
      length: 0,
      text: '',
      groups: [],
      namedGroups: {}
    });

    expect(result.segments).toHaveLength(2);
    expect(result.segments[0]).toEqual({
      type: 'match',
      text: '',
      matchIndex: 0,
      index: 0,
      length: 0
    });
    expect(result.segments[1]).toEqual({
      type: 'text',
      text: 'abc'
    });
  });

  it('should capture groups correctly', () => {
    const result = runRegex('(\\w+)\\s(\\w+)', 'g', 'hello world');
    expect(result.isValid).toBe(true);
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].groups).toEqual(['hello', 'world']);
  });

  it('should build correct segments for text highlighting', () => {
    const result = runRegex('world', 'g', 'hello world test');
    expect(result.isValid).toBe(true);
    expect(result.segments).toHaveLength(3);

    expect(result.segments[0]).toEqual({ type: 'text', text: 'hello ' });
    expect(result.segments[1]).toEqual({
      type: 'match',
      text: 'world',
      matchIndex: 0,
      index: 6,
      length: 5
    });
    expect(result.segments[2]).toEqual({ type: 'text', text: ' test' });
  });

  it('should resolve HTML Tag preset quickly on adversarial input without ReDoS', () => {
    const htmlPreset = REGEX_PRESETS.find((p) => p.id === 'html_tag');
    expect(htmlPreset).toBeDefined();

    const adversarialInput = '<div ' + 'a'.repeat(30) + 'X';
    const start = performance.now();
    const result = runRegex(htmlPreset.pattern, htmlPreset.flags, adversarialInput);
    const duration = performance.now() - start;

    expect(result.isValid).toBe(true);
    expect(duration).toBeLessThan(100);
  });
});
