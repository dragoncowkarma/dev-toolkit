import { describe, expect, it } from 'vitest';
import { HEADER_BYTES, parseHex, parseVhdx } from './vhdx.utils.js';

function fixture() {
  const bytes = new Uint8Array(HEADER_BYTES);
  const view = new DataView(bytes.buffer);
  const write = (offset, text) => {
    for (let i = 0; i < text.length; i += 1) bytes[offset + i] = text.charCodeAt(i);
  };
  write(0, 'vhdxfile');
  view.setUint16(8, 65, true);
  for (const offset of [65536, 131072]) {
    write(offset, 'head');
    view.setUint32(offset + 4, 0x12345678, true);
    view.setBigUint64(offset + 8, 9007199254740993n, true);
    view.setUint32(offset + 16, 0x12345678, true);
    view.setUint16(offset + 20, 0x1234, true);
    view.setUint16(offset + 22, 0xabcd, true);
    view.setUint16(offset + 66, 1, true);
    view.setUint32(offset + 68, 1048576, true);
    view.setBigUint64(offset + 72, 9007199254740995n, true);
  }
  for (const offset of [196608, 262144]) {
    write(offset, 'regi');
    view.setUint32(offset + 8, 1, true);
    view.setUint32(offset + 16, 0xabcdef01, true);
    view.setBigUint64(offset + 32, 9007199254740997n, true);
    view.setUint32(offset + 40, 1024, true);
    view.setUint32(offset + 44, 1, true);
  }
  return bytes;
}

describe('parseVhdx', () => {
  it('decodes both headers and region tables with lossless 64-bit values', () => {
    const result = parseVhdx(fixture());
    expect(result.ok).toBe(true);
    expect(result.creator).toBe('A');
    expect(result.headers).toHaveLength(2);
    expect(result.headers[0]).toMatchObject({
      checksum: 0x12345678, sequence: 9007199254740993n,
      fileWriteGuid: '12345678-1234-abcd-0000-000000000000',
      version: 1, logLength: 1048576, logOffset: 9007199254740995n,
    });
    expect(result.regionTables).toHaveLength(2);
    expect(result.regionTables[1].entries[0]).toMatchObject({
      guid: 'abcdef01-0000-0000-0000-000000000000',
      offset: 9007199254740997n, length: 1024, required: true,
    });
  });

  it('rejects a bad file signature', () => {
    const bytes = fixture();
    bytes[0] = 0;
    expect(parseVhdx(bytes)).toMatchObject({
      ok: false, error: expect.stringMatching(/file signature/),
    });
  });

  it.each([65536, 131072])('rejects a bad header signature at %i', (offset) => {
    const bytes = fixture();
    bytes[offset] = 0;
    expect(parseVhdx(bytes)).toMatchObject({
      ok: false, error: expect.stringMatching(/header signature/),
    });
  });

  it('rejects truncated buffers and invalid region tables', () => {
    expect(parseVhdx(fixture().subarray(0, HEADER_BYTES - 1))).toMatchObject({ ok: false });
    const bytes = fixture();
    new DataView(bytes.buffer).setUint32(196616, 2048, true);
    expect(parseVhdx(bytes)).toMatchObject({
      ok: false, error: expect.stringMatching(/entry count/),
    });
  });

  it('parses hex pairs and rejects malformed input', () => {
    expect(parseHex('00 ff\nAB').bytes).toEqual(new Uint8Array([0, 255, 171]));
    expect(parseHex('abc').ok).toBe(false);
    expect(parseHex('zz').ok).toBe(false);
  });
});
