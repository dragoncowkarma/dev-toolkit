import { describe, expect, it } from 'vitest';
import { jsonArrayToJsonl, jsonlToJsonArray, parseJsonl } from './jsonl.utils.js';

describe('parseJsonl', () => {
  it('parses valid records and counts every physical input line', () => {
    const result = parseJsonl('{"id":1}\n["two"]\ntrue');

    expect(result.values).toEqual([{ id: 1 }, ['two'], true]);
    expect(result.errors).toEqual([]);
    expect(result.stats).toEqual({
      totalLines: 3,
      validLines: 3,
      invalidLines: 0,
      parsedObjects: 3,
    });
  });

  it('skips blank lines without treating them as invalid records', () => {
    const result = parseJsonl('{"id":1}\n\n  \n{"id":2}');

    expect(result.values).toEqual([{ id: 1 }, { id: 2 }]);
    expect(result.stats).toEqual({
      totalLines: 4,
      validLines: 2,
      invalidLines: 0,
      parsedObjects: 2,
    });
  });

  it('returns zero statistics for an empty stream', () => {
    expect(parseJsonl('')).toMatchObject({
      values: [],
      errors: [],
      stats: {
        totalLines: 0,
        validLines: 0,
        invalidLines: 0,
        parsedObjects: 0,
      },
    });
  });

  it('reports exact invalid line numbers while retaining valid records', () => {
    const result = parseJsonl('{"id":1}\n{"broken":}\n{"id":3}');

    expect(result.values).toEqual([{ id: 1 }, { id: 3 }]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({ line: 2, content: '{"broken":}' });
    expect(result.errors[0].reason).toEqual(expect.any(String));
    expect(result.stats).toEqual({
      totalLines: 3,
      validLines: 2,
      invalidLines: 1,
      parsedObjects: 2,
    });
  });
});

describe('JSONL conversions', () => {
  it('formats all valid JSONL records as a JSON array', () => {
    const result = jsonlToJsonArray('{"id":1}\n{"id":2}');

    expect(result.output).toBe('[\n  {\n    "id": 1\n  },\n  {\n    "id": 2\n  }\n]');
  });

  it('converts a JSON array into compact JSON Lines records', () => {
    const result = jsonArrayToJsonl('[{"id":1},{"id":2,"active":true}]');

    expect(result.output).toBe('{"id":1}\n{"id":2,"active":true}');
    expect(result.stats).toEqual({
      totalLines: 2,
      validLines: 2,
      invalidLines: 0,
      parsedObjects: 2,
    });
  });

  it('rejects a JSON value that is not an array', () => {
    expect(() => jsonArrayToJsonl('{"id":1}'))
      .toThrow('JSON input must be an array to convert it to JSONL.');
  });
});
