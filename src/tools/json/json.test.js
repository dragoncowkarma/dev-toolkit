import { describe, it, expect } from 'vitest';
import { validateJson, formatJson, minifyJson } from './json.utils';

describe('JSON Utilities - Validation', () => {
  it('should validate a correct JSON string', () => {
    const validJson = '{"name": "John", "age": 30, "city": "New York"}';
    const result = validateJson(validJson);
    expect(result.isValid).toBe(true);
    expect(result.line).toBeNull();
    expect(result.column).toBeNull();
  });

  it('should invalidate an empty JSON string', () => {
    const result = validateJson('');
    expect(result.isValid).toBe(false);
    expect(result.message).toContain('empty');
  });

  it('should locate a syntax error correctly for missing commas', () => {
    const invalidJson = '{\n  "name": "John"\n  "age": 30\n}';
    const result = validateJson(invalidJson);
    expect(result.isValid).toBe(false);
    expect(result.line).toBe(3);
    expect(result.column).toBeGreaterThan(0);
    expect(result.snippet).toContain('>');
    expect(result.snippet).toContain('^');
  });

  it('should locate a syntax error correctly for unclosed brackets', () => {
    const invalidJson = '{"items": [1, 2, 3';
    const result = validateJson(invalidJson);
    expect(result.isValid).toBe(false);
    expect(result.line).toBe(1);
    expect(result.snippet).toContain('^');
  });
});

describe('JSON Utilities - Formatting', () => {
  const sample = '{"a":1,"b":[2,3]}';

  it('should format with 2-space indentation by default', () => {
    const formatted = formatJson(sample, '2');
    expect(formatted).toBe('{\n  "a": 1,\n  "b": [\n    2,\n    3\n  ]\n}');
  });

  it('should format with 4-space indentation', () => {
    const formatted = formatJson(sample, '4');
    expect(formatted).toBe('{\n    "a": 1,\n    "b": [\n        2,\n        3\n    ]\n}');
  });

  it('should format with tab indentation', () => {
    const formatted = formatJson(sample, 'tab');
    expect(formatted).toBe('{\n\t"a": 1,\n\t"b": [\n\t\t2,\n\t\t3\n\t]\n}');
  });
});

describe('JSON Utilities - Minification', () => {
  it('should minify a formatted JSON string', () => {
    const formatted = '{\n  "name": "John",\n  "age": 30\n}';
    const minified = minifyJson(formatted);
    expect(minified).toBe('{"name":"John","age":30}');
  });

  it('should minify a deeply nested JSON structure', () => {
    const complex = '{\n  "a": {\n    "b": [\n      {\n        "c": 1\n      }\n    ]\n  }\n}';
    expect(minifyJson(complex)).toBe('{"a":{"b":[{"c":1}]}}');
  });
});

