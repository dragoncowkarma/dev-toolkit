import { describe, expect, it } from 'vitest';
import { decodeInput, formatSize, parseQcow2 } from './qcow2.utils.js';

function fixture(version = 2, length = version === 2 ? 72 : 105) {
  const bytes = new Uint8Array(length);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x514649fb);
  view.setUint32(4, version);
  if (length >= 72) {
    view.setUint32(20, 16);
    view.setBigUint64(24, 9007199254740993n);
    view.setUint32(32, 2);
    view.setUint32(36, 128);
    view.setBigUint64(40, 4096n);
    view.setBigUint64(48, 8192n);
    view.setUint32(56, 2);
    view.setUint32(60, 1);
    view.setBigUint64(64, 12288n);
  }
  if (version === 3 && length >= 104) {
    view.setBigUint64(72, 0x15n);
    view.setBigUint64(80, 1n);
    view.setBigUint64(88, 2n);
    view.setUint32(96, 4);
    view.setUint32(100, length >= 105 ? 105 : 104);
    if (length >= 105) bytes[104] = 1;
  }
  return bytes;
}

describe('QCOW2 header parser', () => {
  it('parses a v2 base header without losing 64-bit precision', () => {
    expect(parseQcow2(fixture())).toMatchObject({
      version: 2, backingPath: '', clusterSize: 65536n, virtualSize: 9007199254740993n,
      encryption: 2, l1Size: 128, l1Offset: 4096n, refcountOffset: 8192n,
      refcountClusters: 2, snapshotCount: 1, snapshotsOffset: 12288n,
    });
    expect(formatSize(1024n)).toBe('1.00 KiB');
  });

  it('reads a UTF-8 backing path and rejects out-of-bounds paths', () => {
    const bytes = fixture(2, 80);
    const view = new DataView(bytes.buffer);
    view.setBigUint64(8, 72n);
    view.setUint32(16, 8);
    bytes.set(new TextEncoder().encode('base.img'), 72);
    expect(parseQcow2(bytes).backingPath).toBe('base.img');
    view.setBigUint64(8, 0xffffffffffffffffn);
    expect(() => parseQcow2(bytes)).toThrow(/out of bounds/);
    view.setBigUint64(8, 72n);
    expect(parseQcow2(bytes.subarray(0, 72), {
      totalSize: 80, backingBytes: bytes.subarray(72),
    }).backingPath).toBe('base.img');
  });

  it('parses v3 features, refcount order and compression', () => {
    expect(parseQcow2(fixture(3))).toMatchObject({
      incompatibleFeatures: 0x15n, compatibleFeatures: 1n, autoclearFeatures: 2n,
      refcountOrder: 4, refcountBits: 16n, headerLength: 105, compressionType: 1,
    });
    expect(parseQcow2(fixture(3, 104)).compressionType).toBeNull();
  });

  it('reports invalid magic, version, truncated headers and dangerous shifts', () => {
    const bytes = fixture();
    bytes[0] = 0;
    expect(() => parseQcow2(bytes)).toThrow(/magic/);
    const unsupported = fixture();
    new DataView(unsupported.buffer).setUint32(4, 4);
    expect(() => parseQcow2(unsupported)).toThrow(/Unsupported/);
    expect(() => parseQcow2(new Uint8Array(3))).toThrow(/Truncated/);
    expect(() => parseQcow2(fixture(3, 72))).toThrow(/Truncated/);
    const extended = fixture(3, 104);
    new DataView(extended.buffer).setUint32(100, 105);
    expect(() => parseQcow2(extended)).toThrow(/Truncated/);
    new DataView(unsupported.buffer).setUint32(4, 2);
    new DataView(unsupported.buffer).setUint32(20, 0xffffffff);
    expect(() => parseQcow2(unsupported)).toThrow(/cluster bits/);
  });

  it('decodes pasted formats and rejects malformed input', () => {
    expect([...decodeInput('51 46 49 fb', 'hex')]).toEqual([81, 70, 73, 251]);
    expect([...decodeInput('UUZJ+w==', 'base64')]).toEqual([81, 70, 73, 251]);
    expect(() => decodeInput('abc', 'hex')).toThrow(/hexadecimal/);
    expect(() => decodeInput('abc!', 'base64')).toThrow(/Base64/);
  });
});
