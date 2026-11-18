import { describe, expect, it } from 'vitest';
import { parseOgg } from './ogg.utils.js';

function page({ flags = 0, granule = 0n, serial = 1, sequence = 0, segments = [], payload = [] }) {
  const bytes = new Uint8Array(27 + segments.length + payload.length);
  bytes.set([0x4f, 0x67, 0x67, 0x53, 0, flags], 0);
  new DataView(bytes.buffer).setBigUint64(6, granule, true);
  const view = new DataView(bytes.buffer);
  view.setUint32(14, serial, true);
  view.setUint32(18, sequence, true);
  view.setUint32(22, 0x12345678, true);
  bytes[26] = segments.length;
  bytes.set(segments, 27);
  bytes.set(payload, 27 + segments.length);
  return bytes;
}

function join(...chunks) {
  const size = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const result = new Uint8Array(size);
  let offset = 0;
  chunks.forEach((chunk) => {
    result.set(chunk, offset);
    offset += chunk.length;
  });
  return result;
}

describe('parseOgg', () => {
  it('parses a valid single BOS/EOS page and recognizes OpusHead', () => {
    const bytes = page({
      flags: 0x06, granule: 960n, serial: 99, segments: [8],
      payload: [79, 112, 117, 115, 72, 101, 97, 100],
    });
    const result = parseOgg(bytes);
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0]).toMatchObject({
      beginningOfStream: true, endOfStream: true, granulePosition: '960',
      serialNumber: 99, payloadSize: 8, checksum: '0x12345678',
    });
    expect(result.codecs).toEqual([{ serialNumber: 99, codec: 'Opus' }]);
  });

  it('walks multi-page streams and reports continued packets', () => {
    const first = page({
      flags: 0x02, serial: 4, segments: [255], payload: new Array(255).fill(0),
    });
    const second = page({ flags: 0x05, serial: 4, sequence: 1, segments: [1], payload: [0] });
    const result = parseOgg(join(first, second));
    expect(result.pages).toHaveLength(2);
    expect(result.pages[1]).toMatchObject({
      continued: true, endOfStream: true, sequenceNumber: 1, payloadSize: 1,
    });
  });

  it('returns a path-qualified bounds error for truncated page input', () => {
    expect(() => parseOgg(new Uint8Array([0x4f, 0x67, 0x67, 0x53]))).toThrow(
      /Ogg page 0 header: requires 27 byte/,
    );
  });
});
