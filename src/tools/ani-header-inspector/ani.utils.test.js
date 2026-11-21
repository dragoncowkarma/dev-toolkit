import { describe, expect, it } from 'vitest';
import { parseAni } from './ani.utils.js';

function fourCC(value) {
  return [...value].map((character) => character.charCodeAt(0));
}

function uint32(value) {
  return [value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255];
}

function chunk(id, body) {
  return [...fourCC(id), ...uint32(body.length), ...body, ...(body.length % 2 ? [0] : [])];
}

function aniFile(chunks) {
  const body = [...fourCC('ACON'), ...chunks.flat()];
  return new Uint8Array([...fourCC('RIFF'), ...uint32(body.length), ...body]);
}

function headerChunk() {
  return chunk('anih', [36, 0, 0, 0, 2, 0, 0, 0, 3, 0, 0, 0, 32, 0, 0, 0,
    24, 0, 0, 0, 32, 0, 0, 0, 1, 0, 0, 0, 6, 0, 0, 0, 1, 0, 0, 0]);
}

describe('parseAni', () => {
  it('parses a minimal valid ANI header', () => {
    const result = parseAni(aniFile([headerChunk()]));

    expect(result.riffSize).toBe(48);
    expect(result.header).toMatchObject({
      frameCount: 2,
      stepCount: 3,
      width: 32,
      height: 24,
      bitCount: 32,
      planes: 1,
      displayRate: 6,
      flags: 1,
      framesAreIcons: true,
    });
  });

  it('rejects a non-RIFF signature', () => {
    const input = aniFile([headerChunk()]);
    input.set(fourCC('NOPE'), 0);
    expect(() => parseAni(input)).toThrow('expected RIFF signature');
  });

  it('rejects a non-ACON form type', () => {
    const input = aniFile([headerChunk()]);
    input.set(fourCC('WAVE'), 8);
    expect(() => parseAni(input)).toThrow('expected ACON RIFF form type');
  });

  it('rejects a chunk whose declared size exceeds the input', () => {
    const input = aniFile([headerChunk()]);
    input.set(uint32(100), 16);
    expect(() => parseAni(input)).toThrow('Truncated anih chunk');
  });

  it('enumerates multiple icon frames and optional timing chunks', () => {
    const frames = chunk('LIST', [
      ...fourCC('fram'), ...chunk('icon', [1, 2, 3]), ...chunk('icon', [4, 5]),
    ]);
    const result = parseAni(aniFile([
      headerChunk(),
      frames,
      chunk('rate', [...uint32(4), ...uint32(8)]),
      chunk('seq ', [...uint32(1), ...uint32(0)]),
    ]));

    expect(result.frames).toEqual([
      { offset: 76, length: 3 },
      { offset: 88, length: 2 },
    ]);
    expect(result.rates).toEqual([4, 8]);
    expect(result.sequence).toEqual([1, 0]);
  });
});
