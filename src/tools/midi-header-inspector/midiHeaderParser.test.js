import { describe, expect, it } from 'vitest';
import { parseMidiHeader } from './midiHeaderParser.js';

function createMidi({ format = 0, tracks = [[]], division = 480 } = {}) {
  const bytes = [
    0x4d, 0x54, 0x68, 0x64,
    0x00, 0x00, 0x00, 0x06,
    0x00, format,
    0x00, tracks.length,
    division >> 8, division & 0xff,
  ];
  for (const track of tracks) {
    bytes.push(0x4d, 0x54, 0x72, 0x6b, 0x00, 0x00, 0x00, track.length, ...track);
  }
  return new Uint8Array(bytes);
}

describe('parseMidiHeader', () => {
  it('parses a valid single-track file', () => {
    const result = parseMidiHeader(createMidi({ tracks: [[0x00, 0xff, 0x2f, 0x00]] }));

    expect(result.header).toMatchObject({ formatType: 0, trackCount: 1, length: 6 });
    expect(result.header.division).toEqual({
      type: 'ticks-per-quarter-note',
      ticksPerQuarterNote: 480,
    });
    expect(result.tracks).toEqual([{ index: 1, offset: 14, length: 4, dataOffset: 22 }]);
  });

  it('parses multiple tracks and records each chunk offset', () => {
    const result = parseMidiHeader(createMidi({ format: 1, tracks: [[1, 2], [3]] }));

    expect(result.header.trackCount).toBe(2);
    expect(result.tracks).toEqual([
      { index: 1, offset: 14, length: 2, dataOffset: 22 },
      { index: 2, offset: 24, length: 1, dataOffset: 32 },
    ]);
  });

  it('parses an SMPTE division', () => {
    const result = parseMidiHeader(createMidi({ division: 0xe728 }));

    expect(result.header.division).toEqual({
      type: 'smpte',
      framesPerSecond: 25,
      ticksPerFrame: 40,
    });
  });

  it('rejects a file with an invalid header magic', () => {
    const midi = createMidi();
    midi[0] = 0;

    expect(() => parseMidiHeader(midi)).toThrow('Expected an MThd header chunk.');
  });

  it('rejects a track whose declared data length exceeds the buffer', () => {
    const midi = createMidi({ tracks: [[0xff]] });
    midi[21] = 2;

    expect(() => parseMidiHeader(midi)).toThrow('Track 1 data is truncated.');
  });
});
