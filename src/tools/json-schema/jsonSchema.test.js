import { describe, expect, it } from 'vitest';
import {
  inferSchema,
  generateSchema,
  formatSchema,
  getSchemaStats,
} from './jsonSchema.utils.js';

describe('jsonSchema.utils', () => {
  describe('inferSchema - Scalars', () => {
    it('infers string schema', () => {
      const schema = inferSchema('hello');
      expect(schema.type).toBe('string');
    });

    it('infers number schema by default', () => {
      const schema = inferSchema(42);
      expect(schema.type).toBe('number');
    });

    it('infers boolean schema', () => {
      const schema = inferSchema(true);
      expect(schema.type).toBe('boolean');
    });

    it('infers null schema', () => {
      const schema = inferSchema(null);
      expect(schema.type).toBe('null');
    });
  });

  describe('inferSchema - Options', () => {
    it('distinguishes integer when inferIntegers is true', () => {
      expect(inferSchema(42, { inferIntegers: true }).type).toBe('integer');
      expect(inferSchema(42.5, { inferIntegers: true }).type).toBe('number');
      expect(inferSchema(42, { inferIntegers: false }).type).toBe('number');
    });

    it('attaches examples on scalar leaf schemas when includeExamples is true', () => {
      expect(inferSchema('text', { includeExamples: true }).examples).toEqual(['text']);
      expect(inferSchema(10, { includeExamples: true }).examples).toEqual([10]);
      expect(inferSchema(false, { includeExamples: true }).examples).toEqual([false]);
      expect(inferSchema(null, { includeExamples: true }).examples).toEqual([null]);
    });

    it('emits draft-07 $schema URI', () => {
      const schema = inferSchema('test', { draft: 'draft-07' });
      expect(schema.$schema).toBe('http://json-schema.org/draft-07/schema#');
    });

    it('emits 2020-12 $schema URI by default', () => {
      const schema = inferSchema('test', { draft: '2020-12' });
      expect(schema.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
    });

    it('adds root title when provided', () => {
      const schema = inferSchema('test', { title: 'User Payload' });
      expect(schema.title).toBe('User Payload');
    });
  });

  describe('inferSchema - Objects', () => {
    it('infers object schema with required array by default', () => {
      const sample = { id: 1, name: 'Alice' };
      const schema = inferSchema(sample);
      expect(schema.type).toBe('object');
      expect(schema.properties).toBeDefined();
      expect(schema.properties.id.type).toBe('number');
      expect(schema.properties.name.type).toBe('string');
      expect(schema.required).toEqual(['id', 'name']);
    });

    it('omits required array when requiredMode is none', () => {
      const sample = { id: 1, name: 'Alice' };
      const schema = inferSchema(sample, { requiredMode: 'none' });
      expect(schema.required).toBeUndefined();
    });

    it('handles empty object', () => {
      const schema = inferSchema({});
      expect(schema.type).toBe('object');
      expect(schema.properties).toEqual({});
      expect(schema.required).toEqual([]);
    });

    it('handles deeply nested object structures (≥4 levels)', () => {
      const nested = {
        level1: {
          level2: {
            level3: {
              level4: {
                value: 'deep',
              },
            },
          },
        },
      };
      const schema = inferSchema(nested);
      const l4 = schema.properties.level1.properties.level2.properties.level3.properties.level4;
      expect(l4.type).toBe('object');
      expect(l4.properties.value.type).toBe('string');
    });
  });

  describe('inferSchema - Arrays', () => {
    it('handles empty array', () => {
      const schema = inferSchema([]);
      expect(schema.type).toBe('array');
      expect(schema.items).toBeUndefined();
    });

    it('handles array of uniform items', () => {
      const schema = inferSchema([1, 2, 3]);
      expect(schema.type).toBe('array');
      expect(schema.items).toEqual({ type: 'number' });
    });

    it('handles array of mixed items with deduplicated anyOf', () => {
      const schema = inferSchema([1, 'hello', 2, true, 'world']);
      expect(schema.type).toBe('array');
      expect(schema.items).toEqual({
        anyOf: [
          { type: 'number' },
          { type: 'string' },
          { type: 'boolean' },
        ],
      });
    });

    it('collapses identical object shapes in array', () => {
      const schema = inferSchema([{ a: 1 }, { a: 2 }]);
      expect(schema.type).toBe('array');
      expect(schema.items).toEqual({
        type: 'object',
        properties: { a: { type: 'number' } },
        required: ['a'],
      });
    });
  });

  describe('generateSchema & formatSchema', () => {
    it('returns schema object and null error for valid JSON string', () => {
      const json = '{"key": "value"}';
      const result = generateSchema(json);
      expect(result.error).toBeNull();
      expect(result.schema.type).toBe('object');
    });

    it('returns error without throwing on malformed JSON', () => {
      const invalidJson = '{"key": value}';
      const result = generateSchema(invalidJson);
      expect(result.schema).toBeNull();
      expect(typeof result.error).toBe('string');
      expect(result.error.length).toBeGreaterThan(0);
    });

    it('returns error without throwing on empty input', () => {
      const result = generateSchema('');
      expect(result.schema).toBeNull();
      expect(result.error).toBe('JSON input is empty.');
    });

    it('produces stable key ordering in formatSchema', () => {
      const schema = {
        required: ['b', 'a'],
        type: 'object',
        properties: { b: { type: 'string' }, a: { type: 'number' } },
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        title: 'Sample',
      };

      const formatted = formatSchema(schema);
      const keysInFormatted = formatted
        .split('\n')
        .filter((line) => line.includes('"'))
        .map((line) => line.trim().split(':')[0].replaceAll('"', ''));

      expect(keysInFormatted[0]).toBe('$schema');
      expect(keysInFormatted[1]).toBe('title');
      expect(keysInFormatted[2]).toBe('type');
      expect(keysInFormatted[3]).toBe('properties');
    });
  });

  describe('getSchemaStats', () => {
    it('calculates object and property count accurately', () => {
      const { schema } = generateSchema(
        '{"user": {"name": "Alice", "age": 30}, "active": true}'
      );
      const stats = getSchemaStats(schema);
      expect(stats.objectCount).toBe(2);
      expect(stats.propertyCount).toBe(4);
    });

    it('returns zeros for null or non-object schema', () => {
      expect(getSchemaStats(null)).toEqual({ objectCount: 0, propertyCount: 0 });
      expect(getSchemaStats({ type: 'string' })).toEqual({ objectCount: 0, propertyCount: 0 });
    });
  });
});
