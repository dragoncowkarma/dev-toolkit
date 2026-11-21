import { describe, expect, it, vi } from 'vitest';
import {
  buildSampleCodestreamBuffer,
  buildSampleJp2Buffer,
  formatByteSize,
  parseJp2Container,
  readFileAsUint8Array,
} from './jp2BoxInspector.utils.js';

describe('parseJp2Container — valid JP2 containers', () => {
  it('parses minimal valid JP2 signature, ftyp, jp2h, ihdr, colr, and res boxes', () => {
    const buffer = buildSampleJp2Buffer({
      width: 800,
      height: 600,
      componentCount: 3,
      bpc: 0x07,
      enumCS: 16,
      includeResolution: true,
    });

    const result = parseJp2Container(buffer);

    expect(result.isValid).toBe(true);
    expect(result.format).toBe('JP2');
    expect(result.isRawCodestream).toBe(false);
    expect(result.containerAvailable).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.signature).toEqual({
      valid: true,
      type: 'jP  ',
      length: 12,
      hex: '0D 0A 87 0A',
    });
    expect(result.fileType).toEqual({
      brand: 'jp2 ',
      minorVersion: 0,
      compatibilityList: ['jp2 '],
    });
    expect(result.header.imageHeader).toMatchObject({
      width: 800,
      height: 600,
      componentCount: 3,
      bitsPerComponent: 8,
      isSigned: false,
      variesByComponent: false,
      compressionType: 7,
      colourspaceUnknown: false,
      hasIntellectualProperty: false,
    });
    expect(result.header.colourSpecification).toMatchObject({
      method: 1,
      methodName: 'Enumerated Colourspace',
      enumeratedColourspace: 16,
      enumeratedColourspaceName: 'sRGB',
    });
    expect(result.header.resolution.capture.horizontalDpi).toBeCloseTo(300, 0);
    expect(result.header.resolution.display.horizontalDpi).toBeCloseTo(72, 0);
    expect(result.codestreamCount).toBe(1);
  });

  it('supports extended 64-bit box lengths (LBox=1) and box-to-EOF (LBox=0)', () => {
    const buffer = buildSampleJp2Buffer({
      extendedJp2h: true,
      codestreamToEof: true,
    });

    const result = parseJp2Container(buffer.buffer);

    expect(result.isValid).toBe(true);
    const jp2hBox = result.boxes.find((b) => b.type === 'jp2h');
    const jp2cBox = result.boxes.find((b) => b.type === 'jp2c');
    expect(jp2hBox.lengthMode).toBe('64-bit');
    expect(jp2hBox.headerSize).toBe(16);
    expect(jp2cBox.lengthMode).toBe('to-eof');
    expect(jp2cBox.declaredLength).toBe(0);
  });

  it('decodes bpcc per-component bit depths and ICC profile colr (METH=2)', () => {
    const iccBytes = new Uint8Array(40);
    const view = new DataView(iccBytes.buffer);
    view.setUint32(0, 40, false);
    iccBytes.set([0x6d, 0x6e, 0x74, 0x72], 12);
    iccBytes.set([0x52, 0x47, 0x42, 0x20], 16);
    iccBytes.set([0x58, 0x59, 0x5a, 0x20], 20);
    iccBytes.set([0x61, 0x63, 0x73, 0x70], 36);

    const buffer = buildSampleJp2Buffer({
      componentCount: 3,
      bpc: 0xff,
      bpccValues: [0x07, 0x09, 0x8b],
      iccProfileBytes: iccBytes,
    });

    const result = parseJp2Container(buffer);

    expect(result.isValid).toBe(true);
    expect(result.header.imageHeader.variesByComponent).toBe(true);
    expect(result.header.bitsPerComponent).toEqual([
      { index: 0, bitDepth: 8, isSigned: false, rawByte: 0x07 },
      { index: 1, bitDepth: 10, isSigned: false, rawByte: 0x09 },
      { index: 2, bitDepth: 12, isSigned: true, rawByte: 0x8b },
    ]);
    expect(result.header.colourSpecification).toMatchObject({
      method: 2,
      methodName: 'Restricted ICC Profile',
      iccProfileSize: 40,
      iccProfile: {
        byteLength: 40,
        declaredSize: 40,
        deviceClass: 'mntr',
        colorSpaceSignature: 'RGB ',
        pcsSignature: 'XYZ ',
        acspSignatureValid: true,
      },
    });
  });

  it('decodes Greyscale (17) and sYCC (18) enumerated colourspaces', () => {
    const grey = parseJp2Container(buildSampleJp2Buffer({ enumCS: 17 }));
    const sycc = parseJp2Container(buildSampleJp2Buffer({ enumCS: 18 }));

    expect(grey.header.colourSpecification.enumeratedColourspaceName).toBe('Greyscale');
    expect(sycc.header.colourSpecification.enumeratedColourspaceName).toBe('sYCC');
  });
});

describe('parseJp2Container — raw J2K/J2C codestream detection', () => {
  it('detects the JPEG 2000 SOC marker (0xFF4F) and reports container unavailable', () => {
    const codestream = buildSampleCodestreamBuffer();
    const result = parseJp2Container(codestream);

    expect(result.isValid).toBe(true);
    expect(result.isRawCodestream).toBe(true);
    expect(result.containerAvailable).toBe(false);
    expect(result.format).toBe('J2K Codestream');
    expect(result.errors).toEqual([]);
    expect(result.warnings[0]).toMatch(/SOC marker 0xFF4F/i);
    expect(result.warnings[0]).toMatch(/unavailable/i);
    expect(result.errors.some((e) => /jp2c/i.test(e))).toBe(false);
  });
});

describe('parseJp2Container — malformed, truncated, and oversized inputs', () => {
  it('rejects non-buffer and empty inputs safely without throwing', () => {
    expect(parseJp2Container(null).isValid).toBe(false);
    expect(parseJp2Container(new Uint8Array(0)).errors[0]).toMatch(/empty/i);
  });

  it('reports an error when the JP2 signature box is invalid or too short', () => {
    const shortRes = parseJp2Container(new Uint8Array([0x00, 0x00, 0x00, 0x0c]));
    expect(shortRes.isValid).toBe(false);
    expect(shortRes.errors[0]).toMatch(/too short/i);

    const badSig = buildSampleJp2Buffer();
    badSig[8] = 0x00;
    const badRes = parseJp2Container(badSig);
    expect(badRes.isValid).toBe(false);
    expect(badRes.errors[0]).toMatch(/Invalid JP2 Signature box/i);
  });

  it('handles truncated box headers and oversized 32-bit box lengths safely', () => {
    const valid = buildSampleJp2Buffer();
    const truncated = valid.subarray(0, 16);
    const truncResult = parseJp2Container(truncated);

    expect(truncResult.isValid).toBe(false);
    expect(truncResult.errors.some((e) => /Truncated|oversized/i.test(e))).toBe(true);

    const oversized = buildSampleJp2Buffer();
    const view = new DataView(oversized.buffer);
    view.setUint32(12, 999999, false);
    const overResult = parseJp2Container(oversized);

    expect(overResult.isValid).toBe(false);
    expect(overResult.errors.some((e) => /exceeding|only .* available/i.test(e))).toBe(true);
  });

  it('handles oversized 64-bit extended box lengths and invalid LBox values (2..7)', () => {
    const extBuffer = buildSampleJp2Buffer({ extendedJp2h: true });
    const extView = new DataView(extBuffer.buffer);
    // Offset 12 is ftyp (length 20), so jp2h starts at offset 32.
    extView.setUint32(32 + 8, 0x7fffffff, false);
    const over64 = parseJp2Container(extBuffer);

    expect(over64.isValid).toBe(false);
    expect(over64.errors.some((e) => /Oversized 64-bit/i.test(e))).toBe(true);

    const badLBox = buildSampleJp2Buffer();
    const badView = new DataView(badLBox.buffer);
    badView.setUint32(12, 4, false);
    const badLBoxRes = parseJp2Container(badLBox);

    expect(badLBoxRes.isValid).toBe(false);
    expect(badLBoxRes.errors.some((e) => /Invalid box length \(4\)/i.test(e))).toBe(true);
  });

  it('reports an error when ihdr indicates variable BPC (0xFF) but bpcc is missing', () => {
    const missingBpcc = buildSampleJp2Buffer({ bpc: 0xff });
    const result = parseJp2Container(missingBpcc);

    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => /no Bits Per Component \(bpcc\)/i.test(e))).toBe(true);
  });

  it('reports isValid: false and a missing-codestream error when jp2c is absent', () => {
    const noCodestream = buildSampleJp2Buffer({ includeCodestream: false });
    const result = parseJp2Container(noCodestream);

    expect(result.isValid).toBe(false);
    expect(result.codestreamCount).toBe(0);
    expect(result.errors.some((e) => /Missing required Contiguous Codestream \(jp2c\)/i.test(e)))
      .toBe(true);
  });
});

describe('formatByteSize and readFileAsUint8Array', () => {
  it('formats byte counts across B and KB ranges', () => {
    expect(formatByteSize(-5)).toBe('0 B');
    expect(formatByteSize(512)).toBe('512 B');
    expect(formatByteSize(2048)).toBe('2.0 KB');
  });

  it('reads a File into a Uint8Array', async () => {
    const sample = buildSampleCodestreamBuffer();
    const file = new File([sample], 'test.j2k', { type: 'application/octet-stream' });
    const bytes = await readFileAsUint8Array(file);
    expect(Array.from(bytes)).toEqual(Array.from(sample));
  });

  it('rejects when FileReader fails', async () => {
    const failingReader = {
      readAsArrayBuffer: vi.fn(function readAsArrayBuffer() {
        this.onerror(new Error('disk error'));
      }),
    };
    const OriginalFileReader = global.FileReader;
    global.FileReader = vi.fn(function FileReader() {
      return failingReader;
    });

    await expect(readFileAsUint8Array(new File(['x'], 'x.jp2'))).rejects.toThrow(
      'Failed to read the selected file.'
    );

    global.FileReader = OriginalFileReader;
  });
});
