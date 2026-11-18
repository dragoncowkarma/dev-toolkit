import { describe, expect, it } from 'vitest';
import { parseAviHeader } from './avi-header-inspector.utils.js';

function fourCC(value) {
  return Array.from(value, (character) => character.charCodeAt(0));
}

function uint16(value) {
  return [value & 255, value >> 8];
}

function uint32(value) {
  return [value & 255, (value >>> 8) & 255, (value >>> 16) & 255, value >>> 24];
}

function chunk(id, payload) {
  return [...fourCC(id), ...uint32(payload.length), ...payload, ...(payload.length % 2 ? [0] : [])];
}

function list(type, contents) {
  return chunk('LIST', [...fourCC(type), ...contents]);
}

function validAvi() {
  const mainHeader = new Array(56).fill(0);
  mainHeader.splice(0, 4, ...uint32(40000));
  mainHeader.splice(16, 4, ...uint32(250));
  mainHeader.splice(24, 4, ...uint32(2));
  mainHeader.splice(32, 4, ...uint32(1920));
  mainHeader.splice(36, 4, ...uint32(1080));
  const videoHeader = [...fourCC('vids'), ...fourCC('H264'), ...new Array(48).fill(0)];
  const videoFormat = new Array(20).fill(0);
  videoFormat.splice(14, 2, ...uint16(24));
  videoFormat.splice(16, 4, ...fourCC('H264'));
  const audioHeader = [...fourCC('auds'), ...fourCC('MP3 '), ...new Array(48).fill(0)];
  const header = list('hdrl', [
    ...chunk('avih', mainHeader),
    ...list('strl', [...chunk('strh', videoHeader), ...chunk('strf', videoFormat)]),
    ...list('strl', [...chunk('strh', audioHeader)]),
  ]);
  const riff = [...fourCC('AVI '), ...header];
  return new Uint8Array([...fourCC('RIFF'), ...uint32(riff.length), ...riff]).buffer;
}

describe('parseAviHeader', () => {
  it('parses a valid AVI with one video and one audio stream', () => {
    const parsed = parseAviHeader(validAvi());

    expect(parsed.mainHeader).toMatchObject({
      totalFrames: 250,
      width: 1920,
      height: 1080,
      frameRate: 25,
      streamCount: 2,
    });
    expect(parsed.streams).toEqual([
      { index: 1, type: 'vids', handler: 'H264', compression: 'H264', bitDepth: 24 },
      { index: 2, type: 'auds', handler: 'MP3 ' },
    ]);
  });

  it('rejects malformed or truncated chunks, including missing word padding', () => {
    const truncated = validAvi().slice(0, -1);
    expect(() => parseAviHeader(truncated)).toThrow(/truncated|padding/i);
  });

  it('rejects invalid RIFF and AVI form-type magic', () => {
    const invalidRiff = validAvi().slice(0);
    new Uint8Array(invalidRiff).set(fourCC('RIFX'), 0);
    expect(() => parseAviHeader(invalidRiff)).toThrow(/RIFF magic/);

    const invalidForm = validAvi().slice(0);
    new Uint8Array(invalidForm).set(fourCC('WAVE'), 8);
    expect(() => parseAviHeader(invalidForm)).toThrow(/form type/);
  });
});
