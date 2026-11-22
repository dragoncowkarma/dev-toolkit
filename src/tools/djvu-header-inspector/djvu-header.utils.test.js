import { describe, expect, it } from 'vitest';
import { inspectDjvuHeader } from './djvu-header.utils.js';

function ascii(value) {
  return [...value].map((character) => character.charCodeAt(0));
}

function uint32(value) {
  return [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255];
}

function chunk(id, data) {
  return [...ascii(id), ...uint32(data.length), ...data, ...(data.length % 2 ? [0] : [])];
}

function form(type, chunks) {
  const payload = [...ascii(type), ...chunks.flat()];
  return new Uint8Array([...ascii('AT&TFORM'), ...uint32(payload.length), ...payload]);
}

describe('inspectDjvuHeader', () => {
  it('parses a valid single-page DJVU INFO chunk', () => {
    const info = [0x03, 0x20, 0x02, 0x58, 2, 7, 0x01, 0x2c, 22, 3];
    const result = inspectDjvuHeader(form('DJVU', [chunk('INFO', info)]));

    expect(result.valid).toBe(true);
    expect(result.formType).toBe('DJVU');
    expect(result.info).toMatchObject({
      width: 800, height: 600, majorVersion: 2, minorVersion: 7, dpi: 300, gamma: 2.2,
      rotationFlags: 3,
    });
  });

  it('lists DJVM chunks and reports its DIRM page count', () => {
    const dirm = [0, 0, 2];
    const embedded = [...ascii('DJVU')];
    const chunks = [chunk('DIRM', dirm), chunk('NAVM', [1]), chunk('FORM', embedded)];
    const result = inspectDjvuHeader(form('DJVM', chunks));

    expect(result.valid).toBe(true);
    expect(result.formType).toBe('DJVM');
    expect(result.pageCount).toBe(2);
    expect(result.chunks.map((chunkInfo) => chunkInfo.id)).toEqual(['DIRM', 'NAVM', 'FORM:DJVU']);
    expect(result.chunks[1]).toMatchObject({ size: 1, paddedSize: 2, truncated: false });
  });

  it('does not throw and leaves fields unavailable for invalid or truncated input', () => {
    expect(() => inspectDjvuHeader(new Uint8Array(ascii('AT&TFORM')))).not.toThrow();
    const truncated = inspectDjvuHeader(new Uint8Array(ascii('AT&TFORM')));
    expect(truncated.valid).toBe(false);
    expect(truncated.info.width).toBeNull();
    expect(truncated.warnings).toContain('The IFF85 FORM header is truncated.');
  });
});
