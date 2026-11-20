import { describe, expect, it } from 'vitest';
import { parseSqliteHeader } from './sqliteHeader.utils.js';

function createHeader(pageSize = 4096) {
  const bytes = new Uint8Array(100);
  bytes.set(new TextEncoder().encode('SQLite format 3\u0000'));
  const view = new DataView(bytes.buffer);
  view.setUint16(16, pageSize === 65536 ? 1 : pageSize, false);
  bytes[18] = 1;
  bytes[19] = 2;
  bytes[20] = 16;
  bytes[21] = 64;
  bytes[22] = 32;
  bytes[23] = 32;
  view.setUint32(24, 7, false);
  view.setUint32(28, 12, false);
  view.setUint32(56, 1, false);
  view.setUint32(96, 3045001, false);
  return bytes;
}

describe('parseSqliteHeader', () => {
  it('parses a valid header with a standard page size', () => {
    const result = parseSqliteHeader(createHeader());

    expect(result.fields).toHaveLength(22);
    expect(result.fields.find((field) => field.label === 'Page size')?.value).toBe('4,096 bytes');
    expect(result.fields.find((field) => field.label === 'Text encoding')?.value).toBe('UTF-8');
    expect(result.fields.find((field) => field.label === 'SQLite version number')?.value).toBe(
      '3.45.1 (3045001)'
    );
  });

  it('treats a page size field of one as the SQLite 65536-byte special case', () => {
    const result = parseSqliteHeader(createHeader(65536));

    expect(result.fields.find((field) => field.label === 'Page size')?.value).toBe('65,536 bytes');
    expect(result.fields.find((field) => field.label === 'Page size')?.rawBytes).toBe('00 01');
  });

  it('reports an invalid magic string', () => {
    const bytes = createHeader();
    bytes[0] = 0;

    expect(() => parseSqliteHeader(bytes)).toThrow(/Invalid SQLite header/);
  });

  it('reports a truncated file', () => {
    expect(() => parseSqliteHeader(new Uint8Array(99))).toThrow(/Truncated SQLite file/);
  });
});
