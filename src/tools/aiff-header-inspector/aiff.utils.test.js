import { describe, expect, it } from 'vitest';
import { parseAiffHeader } from './aiff.utils.js';

function fourCC(value) {
  return [...value].map((character) => character.charCodeAt(0));
}

function uint32(value) {
  return [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255];
}

function chunk(id, payload) {
  return [...fourCC(id), ...uint32(payload.length), ...payload, ...(payload.length % 2 ? [0] : [])];
}

function form(type, chunks) {
  const contents = [...fourCC(type), ...chunks.flat()];
  return new Uint8Array([...fourCC('FORM'), ...uint32(contents.length), ...contents]);
}

const rate44100 = [0x40, 0x0e, 0xac, 0x44, 0, 0, 0, 0, 0, 0];
const commonPayload = [0, 2, 0, 0, 0, 16, 0, 16, ...rate44100];

describe('parseAiffHeader', () => {
  it('parses COMM metadata and an 80-bit extended sample rate', () => {
    const parsed = parseAiffHeader(form('AIFF', [chunk('COMM', commonPayload)]));

    expect(parsed.formType).toBe('AIFF');
    expect(parsed.common).toEqual({
      channels: 2,
      sampleFrames: 16,
      bitsPerSample: 16,
      sampleRate: 44100,
    });
  });

  it('parses AIFC compression type and Pascal-string compression name', () => {
    const aifcCommon = [...commonPayload, ...fourCC('sowt'), 13, ...fourCC('Little-endian')];
    const parsed = parseAiffHeader(form('AIFC', [chunk('COMM', aifcCommon)]));

    expect(parsed.common).toMatchObject({
      compressionType: 'sowt',
      compressionName: 'Little-endian',
    });
  });

  it('preserves unknown chunks by ID and declared size while reading SSND headers', () => {
    const parsed = parseAiffHeader(form('AIFF', [
      chunk('JUNK', [1, 2, 3]),
      chunk('SSND', [...uint32(12), ...uint32(512), 99, 98]),
    ]));

    expect(parsed.chunks).toContainEqual({ id: 'JUNK', size: 3 });
    expect(parsed.soundData).toEqual({ offset: 12, blockSize: 512 });
  });

  it('rejects malformed or truncated containers and chunks with readable errors', () => {
    expect(() => parseAiffHeader(new Uint8Array([1, 2, 3]))).toThrow(/too short/i);
    expect(() => parseAiffHeader(form('AIFF', [[...fourCC('COMM'), ...uint32(99), 0]]))).toThrow(
      /exceeds the remaining/i
    );
  });

  it('rejects invalid FORM magic and unsupported form types', () => {
    const invalidMagic = form('AIFF', []);
    invalidMagic.set(fourCC('NOPE'), 0);
    expect(() => parseAiffHeader(invalidMagic)).toThrow(/FORM container magic/i);
    expect(() => parseAiffHeader(form('WAVE', []))).toThrow(/Unsupported FORM type/i);
  });
});
