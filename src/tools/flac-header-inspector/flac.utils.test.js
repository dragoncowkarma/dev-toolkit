import { describe, expect, it } from 'vitest';
import { parseFlacMetadata } from './flac.utils.js';

function uint32(value) {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

function littleUint32(value) {
  return [
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  ];
}

function block(type, payload, isLast = false) {
  const length = payload.length;
  return [
    isLast ? 0x80 | type : type,
    length >>> 16,
    (length >>> 8) & 0xff,
    length & 0xff,
    ...payload,
  ];
}

function flacFile(blocks) {
  return new Uint8Array([0x66, 0x4c, 0x61, 0x43, ...blocks.flat()]).buffer;
}

describe('parseFlacMetadata', () => {
  it('parses STREAMINFO and calculates duration', () => {
    const sampleRate = 44100;
    const totalSamples = 88200;
    const packedHigh = (sampleRate << 12) | ((2 - 1) << 9) | ((16 - 1) << 4);
    const streamInfo = [
      0x04, 0x00, 0x10, 0x00, 0, 0, 0, 0, 0, 0x02,
      ...uint32(packedHigh), ...uint32(totalSamples), ...Array(16).fill(0xab),
    ];
    const result = parseFlacMetadata(flacFile([block(0, streamInfo, true)]));

    expect(result.streamInfo).toMatchObject({
      minBlockSize: 1024,
      maxBlockSize: 4096,
      sampleRate,
      channels: 2,
      bitsPerSample: 16,
      totalSamples,
      durationSeconds: 2,
      md5: 'abababababababababababababababab',
    });
  });

  it('parses VORBIS_COMMENT vendor and key-value comments', () => {
    const encoder = new TextEncoder();
    const vendor = [...encoder.encode('test encoder')];
    const title = [...encoder.encode('TITLE=Example')];
    const artist = [...encoder.encode('ARTIST=Codex')];
    const payload = [
      ...littleUint32(vendor.length), ...vendor, ...littleUint32(2),
      ...littleUint32(title.length), ...title, ...littleUint32(artist.length), ...artist,
    ];
    const result = parseFlacMetadata(flacFile([block(4, payload, true)]));

    expect(result.blocks[0].vorbisComment).toEqual({
      vendor: 'test encoder',
      comments: [{ key: 'TITLE', value: 'Example' }, { key: 'ARTIST', value: 'Codex' }],
    });
  });

  it('passes unknown metadata block types through with their declared length', () => {
    const result = parseFlacMetadata(flacFile([block(12, [1, 2, 3], true)]));
    expect(result.blocks).toEqual([{ type: 12, typeName: 'Unknown (12)', length: 3 }]);
  });

  it('rejects a truncated metadata block', () => {
    const truncated = new Uint8Array([0x66, 0x4c, 0x61, 0x43, 0x80, 0, 0, 4, 1]).buffer;
    expect(() => parseFlacMetadata(truncated)).toThrow(/Truncated FLAC metadata block/);
  });

  it('rejects a malformed VORBIS_COMMENT list before reading its entries', () => {
    const malformed = [
      ...littleUint32(0),
      ...littleUint32(2),
    ];
    expect(() => parseFlacMetadata(flacFile([block(4, malformed, true)])))
      .toThrow(/Truncated FLAC VORBIS_COMMENT comment list/);
  });

  it('rejects files without the FLAC marker', () => {
    expect(() => parseFlacMetadata(new Uint8Array([0x52, 0x49, 0x46, 0x46]).buffer))
      .toThrow(/expected the fLaC marker/);
  });
});
