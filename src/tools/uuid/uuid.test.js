import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BATCH_SIZE,
  MAX_BATCH_SIZE,
  UUID_VERSIONS,
  formatUuid,
  generateUuid,
  generateUuidBatch,
  generateUuidV4,
  generateUuidV7,
  isValidUuid,
} from './uuid.utils.js';

describe('UUID v4 generation', () => {
  it('generates a canonical RFC variant UUID v4', () => {
    const uuid = generateUuidV4();

    expect(uuid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
    expect(isValidUuid(uuid, UUID_VERSIONS.V4)).toBe(true);
  });

  it('generates distinct values', () => {
    expect(new Set(generateUuidBatch(20, UUID_VERSIONS.V4)).size).toBe(20);
  });
});

describe('UUID v7 generation', () => {
  it('encodes the millisecond timestamp and RFC version and variant bits', () => {
    const timestamp = 0x01953572df40;
    const uuid = generateUuidV7(timestamp);

    expect(uuid.startsWith('01953572-df40-7')).toBe(true);
    expect(uuid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
    expect(isValidUuid(uuid, UUID_VERSIONS.V7)).toBe(true);
  });

  it('sorts UUIDs generated at different timestamps chronologically', () => {
    const earlier = generateUuidV7(1_700_000_000_000);
    const later = generateUuidV7(1_700_000_000_001);

    expect(earlier < later).toBe(true);
  });

  it('rejects timestamps outside the unsigned 48-bit range', () => {
    expect(() => generateUuidV7(-1)).toThrow(RangeError);
    expect(() => generateUuidV7(0x1000000000000)).toThrow(RangeError);
    expect(() => generateUuidV7(1.5)).toThrow(RangeError);
  });
});

describe('UUID batch generation', () => {
  it('generates five UUID v4 values by default', () => {
    const uuids = generateUuidBatch();

    expect(uuids).toHaveLength(DEFAULT_BATCH_SIZE);
    expect(uuids.every((uuid) => isValidUuid(uuid, UUID_VERSIONS.V4))).toBe(true);
  });

  it('supports the maximum batch size and UUID v7', () => {
    const uuids = generateUuidBatch(MAX_BATCH_SIZE, UUID_VERSIONS.V7);

    expect(uuids).toHaveLength(MAX_BATCH_SIZE);
    expect(uuids.every((uuid) => isValidUuid(uuid, UUID_VERSIONS.V7))).toBe(true);
  });

  it('rejects invalid batch sizes and versions', () => {
    expect(() => generateUuidBatch(0)).toThrow(RangeError);
    expect(() => generateUuidBatch(101)).toThrow(RangeError);
    expect(() => generateUuidBatch(1.5)).toThrow(RangeError);
    expect(() => generateUuid('v5')).toThrow(/Unsupported UUID version/);
  });
});

describe('UUID formatting and validation', () => {
  const uuid = '123e4567-e89b-42d3-a456-426614174000';

  it('uses lowercase and hyphens by default', () => {
    expect(formatUuid(uuid.toUpperCase())).toBe(uuid);
  });

  it('supports uppercase, compact, and braced output', () => {
    expect(formatUuid(uuid, { uppercase: true, hyphens: false, braces: true })).toBe(
      '{123E4567E89B42D3A456426614174000}'
    );
  });

  it('validates supported versions in every display format', () => {
    expect(isValidUuid(uuid, UUID_VERSIONS.V4)).toBe(true);
    expect(isValidUuid(`{${uuid.replaceAll('-', '').toUpperCase()}}`)).toBe(true);
    expect(isValidUuid(uuid, UUID_VERSIONS.V7)).toBe(false);
  });

  it('rejects malformed values and non-RFC variants', () => {
    expect(isValidUuid('not-a-uuid')).toBe(false);
    expect(isValidUuid('123e4567-e89b-42d3-7456-426614174000')).toBe(false);
    expect(isValidUuid('123e-4567e89b42d3a456426614174000')).toBe(false);
    expect(isValidUuid('{123e4567-e89b-42d3-a456-426614174000')).toBe(false);
    expect(() => formatUuid('not-a-uuid')).toThrow(TypeError);
  });
});
