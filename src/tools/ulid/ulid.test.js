import { describe, expect, it } from 'vitest';
import {
  MAX_BATCH_SIZE,
  decodeUlid,
  generateUlid,
  generateUlidBatch,
  isValidUlid,
  parseTimestampInput,
} from './ulid.utils.js';

describe('ULID generation', () => {
  it('generates a valid 26-character Crockford Base32 ULID', () => {
    const ulid = generateUlid(1_700_000_000_000);

    expect(ulid).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(isValidUlid(ulid)).toBe(true);
  });

  it('round-trips the exact timestamp and randomness payload', () => {
    const timestamp = 1_700_000_000_000;
    const ulid = generateUlid(timestamp, 0x0123456789abcdef0123n);

    expect(decodeUlid(ulid)).toMatchObject({
      timestamp,
      iso: '2023-11-14T22:13:20.000Z',
      randomnessBase32: ulid.slice(10),
      randomnessHex: '0123456789abcdef0123',
    });
  });

  it('generates monotonic batches in lexical order for one timestamp', () => {
    const ulids = generateUlidBatch(10, 1_700_000_000_000, true);

    expect(ulids).toEqual([...ulids].sort());
    expect(new Set(ulids).size).toBe(10);
  });

  it('supports the 100-item batch limit and rejects values outside it', () => {
    expect(generateUlidBatch(MAX_BATCH_SIZE)).toHaveLength(MAX_BATCH_SIZE);
    expect(() => generateUlidBatch(0)).toThrow(RangeError);
    expect(() => generateUlidBatch(MAX_BATCH_SIZE + 1)).toThrow(RangeError);
  });
});

describe('ULID validation and input parsing', () => {
  it('accepts lowercase ULIDs and normalizes them when decoding', () => {
    const decoded = decodeUlid('00000000000000000000000000'.toLowerCase());

    expect(decoded.ulid).toBe('00000000000000000000000000');
    expect(decoded.timestamp).toBe(0);
    expect(decoded.randomnessHex).toBe('00000000000000000000');
  });

  it('reports invalid lengths and prohibited Crockford Base32 characters', () => {
    expect(() => decodeUlid('123')).toThrow('exactly 26 characters');
    expect(() => decodeUlid('0000000000000000000000000I')).toThrow('not a valid Crockford');
    expect(() => decodeUlid('80000000000000000000000000')).toThrow('first ULID character');
  });

  it('parses ISO 8601 and Unix millisecond custom timestamps', () => {
    expect(parseTimestampInput('2023-11-14T22:13:20.000Z')).toBe(1_700_000_000_000);
    expect(parseTimestampInput('1700000000000')).toBe(1_700_000_000_000);
    expect(() => parseTimestampInput('tomorrow-ish')).toThrow('valid ISO 8601');
  });
});
