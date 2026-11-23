import { describe, expect, it } from 'vitest';
import { fletcher64, parseHex, parseSuperblock } from './apfs.utils.js';

function fixture() {
  const bytes = new Uint8Array(4096);
  const view = new DataView(bytes.buffer);
  bytes.set([78, 88, 83, 66], 32);
  view.setUint32(36, 4096, true);
  view.setBigUint64(8, 0x123456789abcdef0n, true);
  view.setBigUint64(40, 9007199254740993n, true);
  view.setBigUint64(48, 3n, true);
  view.setBigUint64(64, 0x102n, true);
  bytes.set(Array.from({ length: 16 }, (_, index) => index), 72);
  view.setUint32(104, 42, true);
  view.setBigUint64(0, fletcher64(bytes), true);
  return bytes;
}

describe('APFS superblock', () => {
  it('parses fields and verifies a checksum', () => {
    const parsed = parseSuperblock(fixture());
    expect(parsed.oid).toBe(0x123456789abcdef0n);
    expect(parsed.blockCount).toBe(9007199254740993n);
    expect(parsed.uuid).toBe('00010203-0405-0607-0809-0a0b0c0d0e0f');
    expect(parsed.featureLabels).toContain('NX_FEATURE_LCFD');
    expect(parsed.incompatibleLabels).toContain('NX_INCOMPAT_FUSION');
    expect(parsed.descriptorBlocks).toBe(42);
    expect(parsed.checksumMatches).toBe(true);
  });

  it('detects an altered block', () => {
    const bytes = fixture();
    bytes[200] ^= 1;
    expect(parseSuperblock(bytes).checksumMatches).toBe(false);
  });

  it('rejects bad magic, short data and invalid block size', () => {
    const bytes = fixture();
    expect(() => parseSuperblock(bytes.subarray(0, 100))).toThrow(/Truncated/);
    bytes[32] = 0;
    expect(() => parseSuperblock(bytes)).toThrow(/magic/);
    bytes[32] = 78;
    new DataView(bytes.buffer).setUint32(36, 5000, true);
    expect(() => parseSuperblock(bytes)).toThrow(/block size/);
  });

  it('does not claim to verify a larger block', () => {
    const bytes = fixture();
    new DataView(bytes.buffer).setUint32(36, 8192, true);
    expect(parseSuperblock(bytes).checksumMatches).toBeNull();
  });

  it('validates hex input', () => {
    expect([...parseHex('ab CD\n01')]).toEqual([171, 205, 1]);
    expect(() => parseHex('xyz')).toThrow(/invalid/);
    expect(() => parseHex('a')).toThrow(/byte pairs/);
  });
});
