import { describe, expect, it } from 'vitest';
import { inspectAniHeader } from './aniHeader.utils.js';

function fourCc(value) {
  return [...value].map((character) => character.charCodeAt(0));
}

function uint32(value) {
  return [
    value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff,
  ];
}

function chunk(id, payload) {
  return [...fourCc(id), ...uint32(payload.length), ...payload, ...(payload.length % 2 ? [0] : [])];
}

function aniFile(chunks) {
  const body = [...fourCc('ACON'), ...chunks.flat()];
  return Uint8Array.from([
    ...fourCc('RIFF'), ...uint32(body.length), ...body,
  ]).buffer;
}

function aniHeader() {
  return [
    36, 0, 0, 0, 2, 0, 0, 0, 3, 0, 0, 0, 32, 0, 0, 0, 32, 0, 0, 0,
    32, 0, 0, 0, 1, 0, 0, 0, 6, 0, 0, 0, 1, 0, 0, 0];
}

describe('inspectAniHeader', () => {
  it('parses an ANI RIFF container regardless of chunk order', () => {
    const fram = chunk('LIST', [
      ...fourCc('fram'), ...chunk('icon', [1, 2]), ...chunk('icon', [3]),
    ]);
    const result = inspectAniHeader(aniFile([
      fram,
      chunk('rate', [...uint32(6), ...uint32(12)]),
      chunk('seq ', [...uint32(1), ...uint32(0)]),
      chunk('anih', aniHeader()),
    ]));

    expect(result.diagnostics).toEqual([]);
    expect(result.header).toMatchObject({
      frameCount: 2, stepCount: 3, width: 32, height: 32, framesAreIconImages: true,
    });
    expect(result.frames).toHaveLength(2);
    expect(result.rates).toEqual([6, 12]);
    expect(result.sequence).toEqual([1, 0]);
  });

  it('reports non-RIFF input without throwing', () => {
    const buffer = Uint8Array.from([...fourCc('NOPE'), ...new Array(8).fill(0)]).buffer;
    expect(inspectAniHeader(buffer).diagnostics.join(' ')).toMatch(/Missing RIFF/);
  });

  it('reports a non-ACON RIFF form type', () => {
    const bytes = Uint8Array.from([...fourCc('RIFF'), ...uint32(4), ...fourCc('WAVE')]);
    expect(inspectAniHeader(bytes.buffer).diagnostics.join(' ')).toMatch(/Expected ACON/);
  });

  it('reports a missing anih chunk', () => {
    const result = inspectAniHeader(aniFile([chunk('rate', uint32(6))]));
    expect(result.diagnostics.join(' ')).toMatch(/Missing required anih/);
  });

  it('reports a truncated anih payload', () => {
    const result = inspectAniHeader(aniFile([chunk('anih', aniHeader().slice(0, 20))]));
    expect(result.header).toBeNull();
    expect(result.diagnostics.join(' ')).toMatch(/anih chunk is truncated/);
  });

  it('reports a chunk that exceeds the remaining RIFF bytes', () => {
    const bytes = Uint8Array.from([
      ...fourCc('RIFF'), ...uint32(16), ...fourCc('ACON'), ...fourCc('anih'),
      ...uint32(36), 0, 0, 0, 0,
    ]);
    expect(inspectAniHeader(bytes.buffer).diagnostics.join(' ')).toMatch(/exceeding/);
  });
});
