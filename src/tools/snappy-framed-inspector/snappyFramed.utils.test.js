import { describe, expect, it } from 'vitest';
import { parseSnappyFramedStream, readSnappyFile } from './snappyFramed.utils.js';

const IDENTIFIER = [0xff, 0x06, 0x00, 0x00, 0x73, 0x4e, 0x61, 0x50, 0x70, 0x59];

function chunk(type, payload) {
  const length = payload.length;
  return [type, length & 0xff, (length >> 8) & 0xff, (length >> 16) & 0xff, ...payload];
}

function stream(...chunks) {
  return Uint8Array.from([...IDENTIFIER, ...chunks.flat()]);
}

describe('parseSnappyFramedStream', () => {
  it('parses compressed and uncompressed data chunks with their masked CRC-32C values', () => {
    const bytes = stream(
      chunk(0x00, [0x78, 0x56, 0x34, 0x12, 0x01, 0x02]),
      chunk(0x01, [0xef, 0xcd, 0xab, 0x90, 0x61, 0x62])
    );

    expect(parseSnappyFramedStream(bytes)).toEqual({
      fileSize: bytes.length,
      chunks: [
        { type: 0xff, kind: 'identifier', label: 'Stream identifier', offset: 0, length: 6 },
        {
          type: 0x00,
          kind: 'compressed',
          label: 'Compressed data',
          offset: 10,
          length: 6,
          crc32c: '0x12345678',
        },
        {
          type: 0x01,
          kind: 'uncompressed',
          label: 'Uncompressed data',
          offset: 20,
          length: 6,
          crc32c: '0x90abcdef',
        },
      ],
    });
  });

  it('rejects a missing or malformed stream identifier', () => {
    expect(() => parseSnappyFramedStream(Uint8Array.from([0x00, 0x00, 0x00, 0x00])))
      .toThrow('Missing stream identifier');
    expect(() => parseSnappyFramedStream(Uint8Array.from([...IDENTIFIER.slice(0, 9), 0x58])))
      .toThrow('Invalid stream identifier');
  });

  it('rejects a truncated chunk header', () => {
    expect(() => parseSnappyFramedStream(Uint8Array.from([...IDENTIFIER, 0x00, 0x04])))
      .toThrow('Truncated chunk header');
  });

  it('rejects a truncated chunk payload', () => {
    const bytes = Uint8Array.from([...IDENTIFIER, 0x00, 0x05, 0x00, 0x00, 1]);
    expect(() => parseSnappyFramedStream(bytes)).toThrow('Truncated chunk payload');
  });

  it('rejects oversized uncompressed chunks', () => {
    const length = 65537;
    const bytes = new Uint8Array(IDENTIFIER.length + 4 + length);
    bytes.set(IDENTIFIER);
    bytes.set(
      [0x01, length & 0xff, (length >> 8) & 0xff, (length >> 16) & 0xff],
      IDENTIFIER.length
    );

    expect(() => parseSnappyFramedStream(bytes)).toThrow('exceeds the 65536-byte maximum');
  });

  it('rejects a reserved unskippable chunk type', () => {
    expect(() => parseSnappyFramedStream(stream(chunk(0x02, []))))
      .toThrow('Reserved unskippable chunk type 0x02');
  });

  it('reports and skips reserved skippable chunks', () => {
    const result = parseSnappyFramedStream(stream(chunk(0x80, [1, 2]), chunk(0xfe, [3])));

    expect(result.chunks).toMatchObject([
      { kind: 'identifier' },
      { type: 0x80, kind: 'skippable', label: 'Reserved skippable', offset: 10, length: 2 },
      { type: 0xfe, kind: 'padding', label: 'Padding', offset: 16, length: 1 },
    ]);
  });
});

describe('readSnappyFile', () => {
  it('reads selected files through File.arrayBuffer', async () => {
    const arrayBuffer = new ArrayBuffer(2);
    const file = { arrayBuffer: () => Promise.resolve(arrayBuffer) };

    await expect(readSnappyFile(file)).resolves.toBe(arrayBuffer);
  });
});
