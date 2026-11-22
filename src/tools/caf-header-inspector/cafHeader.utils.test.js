import { describe, expect, it } from 'vitest';
import { parseCafHeader } from './cafHeader.utils.js';

function ascii(value) {
  return Array.from(value, (character) => character.charCodeAt(0));
}

function uint32(value) {
  return [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255];
}

function int64(value) {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setBigInt64(0, BigInt(value), false);
  return [...bytes];
}

function chunk(type, size, payload) {
  return [...ascii(type), ...int64(size), ...payload];
}

function description() {
  const bytes = new Uint8Array(32);
  const view = new DataView(bytes.buffer);
  view.setFloat64(0, 44100, false);
  bytes.set(ascii('lpcm'), 8);
  view.setUint32(12, 1, false);
  view.setUint32(16, 4, false);
  view.setUint32(20, 1, false);
  view.setUint32(24, 2, false);
  view.setUint32(28, 16, false);
  return [...bytes];
}

describe('parseCafHeader', () => {
  it('parses a minimal CAF file with desc and data chunks', () => {
    const bytes = new Uint8Array([
      ...ascii('caff'), 0, 1, 0, 0,
      ...chunk('desc', 32, description()),
      ...chunk('data', 6, [...uint32(3), 99, 100]),
    ]);
    const result = parseCafHeader(bytes);

    expect(result.error).toBe('');
    expect(result.header).toEqual({ fileVersion: 1, fileFlags: 0 });
    expect(result.chunks[0].details).toMatchObject({ sampleRate: 44100, formatId: 'lpcm' });
    expect(result.chunks[1].details).toEqual({ editCount: 3, payloadByteLength: 2 });
  });

  it('uses the remaining bytes for a data chunk with a read-to-EOF size', () => {
    const result = parseCafHeader(new Uint8Array([
      ...ascii('caff'), 0, 1, 0, 0,
      ...chunk('data', -1, [...uint32(7), 1, 2, 3]),
    ]));

    expect(result.chunks[0]).toMatchObject({ declaredSize: 'Read to EOF', size: 7 });
    expect(result.chunks[0].details).toEqual({ editCount: 7, payloadByteLength: 3 });
  });

  it('does not throw and marks a chunk extending past input as unavailable', () => {
    const result = parseCafHeader(new Uint8Array([
      ...ascii('caff'), 0, 1, 0, 0,
      ...chunk('desc', 32, [0, 0]),
    ]));

    expect(result.error).toBe('');
    expect(result.chunks[0]).toMatchObject({ type: 'desc', size: null, status: 'Unavailable' });
    expect(result.warnings[0]).toMatch(/extends past/);
  });
});
