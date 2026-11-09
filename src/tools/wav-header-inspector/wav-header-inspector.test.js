import { describe, expect, it } from 'vitest';
import { parseWavHeader } from './wav-header-inspector.utils.js';

function fourCC(value) {
  return [...value].map((character) => character.charCodeAt(0));
}

function uint16(value) {
  return [value & 0xff, value >> 8];
}

function uint32(value) {
  return [value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, (value >> 24) & 0xff];
}

function chunk(id, payload) {
  return [
    ...fourCC(id),
    ...uint32(payload.length),
    ...payload,
    ...(payload.length % 2 ? [0] : []),
  ];
}

function wavFile(formatCode = 1, extraChunks = []) {
  const fmt = [
    ...uint16(formatCode),
    ...uint16(2),
    ...uint32(48000),
    ...uint32(192000),
    ...uint16(4),
    ...uint16(16),
  ];
  const body = [
    ...chunk('fmt ', fmt),
    ...extraChunks.flat(),
    ...chunk('data', new Array(192000).fill(0)),
  ];
  const header = [...fourCC('RIFF'), ...uint32(body.length + 4), ...fourCC('WAVE')];
  return new Uint8Array([...header, ...body]).buffer;
}

describe('parseWavHeader', () => {
  it('parses a canonical PCM WAV and computes duration', () => {
    const parsed = parseWavHeader(wavFile());
    expect(parsed.format).toMatchObject({
      audioFormat: 1,
      audioFormatLabel: 'PCM (1)',
      channels: 2,
      sampleRate: 48000,
      bitsPerSample: 16,
    });
    expect(parsed.data).toEqual({ size: 192000, duration: 1 });
    expect(parsed.chunks.map(({ id }) => id)).toEqual(['fmt ', 'data']);
  });

  it('parses IEEE-float WAV metadata without reporting PCM duration', () => {
    const parsed = parseWavHeader(wavFile(3));
    expect(parsed.format.audioFormatLabel).toBe('IEEE float (3)');
    expect(parsed.data.duration).toBeNull();
  });

  it('lists extra and unknown top-level chunks', () => {
    const parsed = parseWavHeader(
      wavFile(1, [chunk('LIST', [1, 2, 3]), chunk('JUNK', [4, 5])])
    );
    expect(parsed.chunks.map(({ id }) => id)).toEqual(['fmt ', 'LIST', 'JUNK', 'data']);
    expect(parsed.chunks[1]).toMatchObject({ offset: 36, size: 3 });
  });

  it('labels an unrecognized format code without rejecting the container', () => {
    const parsed = parseWavHeader(wavFile(0x1234));
    expect(parsed.format.audioFormatLabel).toBe('Unknown (0x1234)');
  });

  it('reports a readable error for a chunk truncated mid-payload', () => {
    const bytes = new Uint8Array(wavFile());
    expect(() => parseWavHeader(bytes.slice(0, 48).buffer)).toThrow(/Truncated data chunk/);
  });

  it('rejects a non-WAV file with wrong magic bytes', () => {
    const bytes = new Uint8Array(wavFile());
    bytes.set(fourCC('NOPE'), 0);
    expect(() => parseWavHeader(bytes.buffer)).toThrow(/missing RIFF magic/);
  });
});
