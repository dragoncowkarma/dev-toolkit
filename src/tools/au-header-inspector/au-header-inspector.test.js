import { describe, expect, it } from 'vitest';
import { getEncodingLabel, parseAuHeader } from './au-header-inspector.utils.js';

function createAuHeader({
  dataSize = 16,
  encoding = 3,
  annotation = '',
  sampleRate = 44100,
  channels = 2,
} = {}) {
  const annotationBytes = new TextEncoder().encode(annotation);
  const bytes = new Uint8Array(24 + annotationBytes.length);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x2e736e64, false);
  view.setUint32(4, bytes.length, false);
  view.setUint32(8, dataSize, false);
  view.setUint32(12, encoding, false);
  view.setUint32(16, sampleRate, false);
  view.setUint32(20, channels, false);
  bytes.set(annotationBytes, 24);
  return bytes;
}

describe('parseAuHeader', () => {
  it('parses a valid big-endian AU header and printable annotation', () => {
    expect(parseAuHeader(createAuHeader({ annotation: 'Created with test' }))).toMatchObject({
      dataOffset: 41,
      dataSize: 16,
      dataSizeUnknown: false,
      encoding: 3,
      encodingLabel: '16-bit linear PCM',
      sampleRate: 44100,
      channels: 2,
      annotation: 'Created with test',
    });
  });

  it('rejects invalid magic', () => {
    const bytes = createAuHeader();
    bytes[0] = 0;
    expect(() => parseAuHeader(bytes)).toThrow(/Invalid AU magic/);
  });

  it('rejects a truncated header', () => {
    expect(() => parseAuHeader(new Uint8Array(23))).toThrow(/truncated/);
  });

  it('represents the unknown data-size sentinel without losing its meaning', () => {
    expect(parseAuHeader(createAuHeader({ dataSize: 0xffffffff }))).toMatchObject({
      dataSize: null,
      dataSizeUnknown: true,
    });
  });

  it('labels known and unknown encodings', () => {
    expect(getEncodingLabel(1)).toBe('8-bit ISDN mu-law');
    expect(parseAuHeader(createAuHeader({ encoding: 99 })).encodingLabel).toBe(
      'Unknown encoding (99)'
    );
  });
});
