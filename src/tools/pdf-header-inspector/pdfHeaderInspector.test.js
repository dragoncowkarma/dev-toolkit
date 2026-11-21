import { describe, expect, it } from 'vitest';
import { decodePdfHex, parsePdfBytes, requirePacketBytes } from './pdfHeaderInspector.utils.js';

const encoder = new TextEncoder();

function classicPdf() {
  const prefix = '%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n';
  const xrefOffset = encoder.encode(prefix).length;
  return encoder.encode(
    `${prefix}xref\n0 2\n0000000000 65535 f \n0000000009 00000 n \n` +
      `trailer\n<< /Size 2 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  );
}

function xrefStreamPdf() {
  const prefix = '%PDF-1.5\n';
  const xrefOffset = encoder.encode(prefix).length;
  return encoder.encode(
    `${prefix}3 0 obj\n<< /Type /XRef /Size 4 /Root 1 0 R /Prev 10 >>\n` +
      `stream\nignored\nendstream\nendobj\nstartxref\n${xrefOffset}\n%%EOF\n`
  );
}

describe('parsePdfBytes', () => {
  it('parses a classic xref table and trailer dictionary', () => {
    const result = parsePdfBytes(classicPdf());

    expect(result).toMatchObject({
      status: 'parsed',
      version: '1.4',
      xrefType: 'classic',
      trailer: { root: '1 0 R', size: 2, previous: null },
    });
    expect(result.xrefEntries).toEqual([
      { objectNumber: 0, offset: 0, generation: 65535, inUse: false, flag: 'f' },
      { objectNumber: 1, offset: 9, generation: 0, inUse: true, flag: 'n' },
    ]);
  });

  it('detects xref streams without attempting to decode their compressed entries', () => {
    const result = parsePdfBytes(xrefStreamPdf());

    expect(result).toMatchObject({
      status: 'parsed',
      version: '1.5',
      xrefType: 'stream',
      xrefEntries: [],
      trailer: { root: '1 0 R', size: 4, previous: 10 },
    });
    expect(result.notice).toMatch(/Cross-reference stream detected/);
  });

  it('returns an undecoded result for truncated or corrupt input', () => {
    expect(parsePdfBytes(encoder.encode('%PDF-1.7\nstartxref\n999\n%%EOF'))).toMatchObject({
      status: 'undecoded',
    });
    expect(parsePdfBytes(encoder.encode('not a PDF'))).toMatchObject({ status: 'undecoded' });
  });
});

describe('PDF input guards', () => {
  it('requires available byte ranges and complete hexadecimal byte pairs', () => {
    expect(requirePacketBytes(new Uint8Array([1]), 0, 2)).toBe(false);
    expect(decodePdfHex('25504446')).toEqual({ bytes: new Uint8Array([37, 80, 68, 70]) });
    expect(decodePdfHex('255')).toMatchObject({ error: expect.any(String) });
  });
});
