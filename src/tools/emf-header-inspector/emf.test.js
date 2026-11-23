import { describe, expect, it } from 'vitest';
import { decodeInput, parseEmfHeader } from './emf.utils.js';

function header(size = 88) {
  const bytes = new Uint8Array(size);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 1, true);
  view.setUint32(4, size, true);
  view.setInt32(8, -12, true);
  view.setUint32(40, 0x464d4520, true);
  view.setUint32(44, 0x10000, true);
  view.setUint32(48, size, true);
  view.setUint32(52, 3, true);
  view.setUint16(56, 7, true);
  view.setInt32(72, 1920, true);
  return bytes;
}

describe('parseEmfHeader', () => {
  it('parses a valid header and signed coordinates', () => {
    expect(parseEmfHeader(header())).toMatchObject({ ok: true, header: {
      recordType: 1, recordSize: 88, bounds: [-12, 0, 0, 0], version: 0x10000,
      fileBytes: 88, recordCount: 3, handleCount: 7, device: [1920, 0],
    } });
  });
  it('rejects an invalid signature and record type', () => {
    const bytes = header();
    bytes[40] = 0;
    expect(parseEmfHeader(bytes).error).toMatch(/signature/i);
    bytes[0] = 2;
    expect(parseEmfHeader(bytes).error).toMatch(/type/i);
  });
  it('rejects truncated buffers and mismatched file or record lengths', () => {
    expect(parseEmfHeader(new Uint8Array(87)).ok).toBe(false);
    const bytes = header();
    const view = new DataView(bytes.buffer);
    view.setUint32(48, 89, true);
    expect(parseEmfHeader(bytes).ok).toBe(false);
    view.setUint32(4, 100, true);
    expect(parseEmfHeader(bytes).ok).toBe(false);
  });
  it('decodes UTF-16LE descriptions and validates their bounds', () => {
    const bytes = header(100);
    const view = new DataView(bytes.buffer);
    view.setUint32(60, 6, true);
    view.setUint32(64, 88, true);
    [...'Hi\0世\0\0'].forEach((char, index) => view.setUint16(88 + index * 2,
      char.charCodeAt(0), true));
    expect(parseEmfHeader(bytes).header.description).toBe('Hi / 世');
    view.setUint32(60, 7, true);
    expect(parseEmfHeader(bytes).error).toMatch(/description/i);
  });
  it('accepts typed array slices without reading adjacent bytes', () => {
    const bytes = new Uint8Array(100);
    bytes.set(header(), 5);
    expect(parseEmfHeader(bytes.subarray(5, 93)).ok).toBe(true);
  });
});

describe('decodeInput', () => {
  it('decodes hex and Base64 and rejects malformed data', () => {
    expect([...decodeInput('00 ff', 'hex').bytes]).toEqual([0, 255]);
    expect([...decodeInput('AP8=', 'base64').bytes]).toEqual([0, 255]);
    expect(decodeInput('0', 'hex').ok).toBe(false);
    expect(decodeInput('!bad', 'base64').ok).toBe(false);
  });
});
