import { describe, expect, it, vi } from 'vitest';
import { parseHex, parseLabel, readLabelFile } from './zfs-label.utils.js';

function label(little = true) {
  const bytes = new Uint8Array(256 * 1024);
  const view = new DataView(bytes.buffer);
  bytes[16384] = 1;
  let offset = 16396;
  function pair(name, value) {
    const start = offset;
    offset += 8;
    const encoded = new TextEncoder().encode(name);
    view.setUint32(offset, encoded.length);
    offset += 4;
    bytes.set(encoded, offset);
    offset += Math.ceil(encoded.length / 4) * 4;
    view.setUint32(offset, typeof value === 'string' ? 9 : 8);
    view.setUint32(offset + 4, 1);
    offset += 8;
    if (typeof value === 'string') {
      const text = new TextEncoder().encode(value);
      view.setUint32(offset, text.length);
      offset += 4;
      bytes.set(text, offset);
      offset += Math.ceil(text.length / 4) * 4;
    } else {
      view.setBigUint64(offset, value);
      offset += 8;
    }
    view.setUint32(start, offset - start);
    view.setUint32(start + 4, offset - start);
  }
  pair('name', 'tank');
  for (const [key, value] of Object.entries({
    version: 5000n, state: 0n, txg: 42n, pool_guid: 9007199254740993n, guid: 2n, ashift: 12n,
  })) pair(key, value);
  for (const [pos, txg] of [[131072, 8n], [132096, 12n]]) {
    view.setBigUint64(pos, 0xbab10cn, little);
    view.setBigUint64(pos + 8, 5000n, little);
    view.setBigUint64(pos + 16, txg, little);
    view.setBigUint64(pos + 24, 99n, little);
    view.setBigUint64(pos + 32, 123n, little);
  }
  return bytes;
}

describe('ZFS label parser', () => {
  it.each([true, false])('parses uberblocks with little endian %s', (little) => {
    const result = parseLabel(label(little));
    expect(result.fields).toEqual({
      name: 'tank', version: '5000', state: '0', txg: '42',
      pool_guid: '9007199254740993', guid: '2', ashift: '12',
    });
    expect(result.uberblock).toEqual({
      version: '5000', txg: '12', guid_sum: '99', timestamp: '123',
    });
  });
  it('reports no valid uberblock when the ring has wrong magic', () => {
    const bytes = label();
    bytes.fill(0, 131072);
    expect(parseLabel(bytes).uberblock).toBeNull();
  });
  it('rejects empty, short, and non-ZFS input', () => {
    expect(() => parseLabel(new Uint8Array())).toThrow(/empty/i);
    expect(() => parseLabel(new Uint8Array(10))).toThrow(/short/i);
    expect(() => parseLabel(new Uint8Array(256 * 1024))).toThrow(/ZFS/i);
  });
  it('parses hex and rejects invalid input', () => {
    expect([...parseHex('ab CD')]).toEqual([171, 205]);
    expect(() => parseHex('abc')).toThrow(/hexadecimal/i);
  });
  it('bounds file reads to L0', async () => {
    const slice = vi.fn(() => ({ arrayBuffer: async () => new ArrayBuffer(256 * 1024) }));
    await readLabelFile({ size: 1024 * 1024, slice });
    expect(slice).toHaveBeenCalledWith(0, 256 * 1024);
  });
});
