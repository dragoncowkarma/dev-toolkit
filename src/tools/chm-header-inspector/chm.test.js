import { describe, expect, it } from 'vitest';
import { parseChmHeader } from './chm.utils.js';

function header(version) {
  const buffer = new ArrayBuffer(version === 3 ? 96 : 88);
  const view = new DataView(buffer);
  new Uint8Array(buffer).set([73, 84, 83, 70]);
  view.setUint32(4, version, true);
  view.setUint32(8, buffer.byteLength, true);
  view.setUint32(20, 1033, true);
  view.setUint32(24, 0x12345678, true);
  view.setUint16(28, 0xabcd, true);
  view.setUint16(30, 0xef01, true);
  new Uint8Array(buffer, 32, 8).set([1, 2, 3, 4, 5, 6, 7, 8]);
  view.setBigUint64(56, 9007199254740993n, true);
  view.setBigUint64(64, 12n, true);
  view.setBigUint64(72, 34n, true);
  view.setBigUint64(80, 56n, true);
  if (version === 3) view.setBigUint64(88, 78n, true);
  return buffer;
}

describe('parseChmHeader', () => {
  it('parses a v2 header and preserves 64-bit precision', () => {
    expect(parseChmHeader(header(2))).toMatchObject({
      Signature: 'ITSF', Version: 2, 'Header length': 88, 'Language ID': 1033,
      'Directory GUID 1': '12345678-abcd-ef01-0102-030405060708',
      'Section 0 offset': '9007199254740993', 'Section 0 length': '12',
      'Directory offset': '34', 'Directory length': '56',
    });
    expect(parseChmHeader(header(2))).not.toHaveProperty('Content offset');
  });
  it('parses the v3 content offset', () => {
    expect(parseChmHeader(header(3))['Content offset']).toBe('78');
  });
  it('rejects bad signatures and unsupported versions', () => {
    const bad = header(2);
    new Uint8Array(bad)[0] = 0;
    expect(() => parseChmHeader(bad)).toThrow(/signature/i);
    new DataView(bad).setUint8(0, 73);
    new DataView(bad).setUint32(4, 4, true);
    expect(() => parseChmHeader(bad)).toThrow(/unsupported/i);
  });
  it('rejects truncated headers', () => {
    for (const length of [0, 4, 11, 87, 95]) {
      const source = header(length === 95 ? 3 : 2);
      expect(() => parseChmHeader(source.slice(0, length))).toThrow(/truncated/i);
    }
  });
});
