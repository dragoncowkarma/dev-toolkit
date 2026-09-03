import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CUID2_LENGTH,
  clampBatchSize,
  clampIdentifierLength,
  generateCuid2,
  generateIdentifierBatch,
  generateNanoId,
  inspectIdentifier,
  normalizeNanoIdAlphabet,
} from './nanoidCuid.utils.js';

describe('NanoID generation', () => {
  it('uses the requested length and alphabet', () => {
    const identifier = generateNanoId(12, 'abc');
    expect(identifier).toHaveLength(12);
    expect(identifier).toMatch(/^[abc]+$/);
  });

  it('keeps multi-code-unit alphabet characters intact', () => {
    const identifier = generateNanoId(8, '😀🚀');
    expect(Array.from(identifier)).toHaveLength(8);
    expect([...identifier].every((character) => character === '😀' || character === '🚀')).toBe(true);
  });

  it('creates unique values across a sample run', () => {
    const identifiers = new Set(Array.from({ length: 100 }, () => generateNanoId()));
    expect(identifiers).toHaveLength(100);
  });

  it('rejects invalid alphabets', () => {
    expect(() => normalizeNanoIdAlphabet('a')).toThrow(/between 2 and 128/);
    expect(() => normalizeNanoIdAlphabet('aab')).toThrow(/unique/);
  });
});

describe('CUID2 generation', () => {
  it('creates default-length lowercase alphanumeric identifiers starting with a letter', () => {
    const identifier = generateCuid2();
    expect(identifier).toHaveLength(DEFAULT_CUID2_LENGTH);
    expect(identifier).toMatch(/^[a-z][a-z0-9]{23}$/);
  });

  it('creates unique values across a sample run', () => {
    const identifiers = new Set(Array.from({ length: 100 }, () => generateCuid2()));
    expect(identifiers).toHaveLength(100);
  });
});

describe('batch generation and bounds', () => {
  it('creates newline-separated batches and clamps user bounds', () => {
    const batch = generateIdentifierBatch('nanoid', 3, { length: 4, alphabet: 'ab' });
    expect(batch.split('\n')).toHaveLength(3);
    expect(clampIdentifierLength(1000)).toBe(128);
    expect(clampBatchSize(1000)).toBe(100);
  });
});

describe('identifier inspection', () => {
  it('recognizes NanoID using the supplied alphabet and length', () => {
    expect(inspectIdentifier('abba', { nanoIdAlphabet: 'ab', nanoIdLength: 4 })).toEqual({
      format: 'NanoID',
      length: 4,
      alphabet: 'ab',
    });
  });

  it('recognizes CUID2 and rejects unknown values', () => {
    expect(inspectIdentifier('a12345678901234567890123')).toMatchObject({
      format: 'CUID2',
      length: 24,
    });
    expect(inspectIdentifier('not a supported identifier')).toMatchObject({ format: 'Neither' });
    expect(inspectIdentifier('012345678901234567890123')).toMatchObject({ format: 'Neither' });
    expect(inspectIdentifier('a123')).toMatchObject({ format: 'Neither' });
  });
});
