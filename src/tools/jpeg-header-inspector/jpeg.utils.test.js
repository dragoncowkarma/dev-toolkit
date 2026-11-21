import { describe, expect, it } from 'vitest';
import {
  createSampleJpeg,
  formatFileSize,
  isSofMarker,
  isStandaloneMarker,
  parseJpeg,
  readJpegFile,
} from './jpeg.utils.js';

describe('jpeg.utils parser', () => {
  it('correctly parses a well-formed JPEG with all expected segments', () => {
    const sampleBuffer = createSampleJpeg();
    const result = parseJpeg(sampleBuffer);

    expect(result.segments.length).toBe(7);

    const segmentNames = result.segments.map((s) => s.name);
    expect(segmentNames).toContain('SOI');
    expect(segmentNames).toContain('APP0/JFIF');
    expect(segmentNames).toContain('DQT');
    expect(segmentNames).toContain('SOF0');
    expect(segmentNames).toContain('DHT');
    expect(segmentNames).toContain('SOS');
    expect(segmentNames).toContain('EOI');

    // Verify SOI
    const soi = result.segments.find((s) => s.name === 'SOI');
    expect(soi.offset).toBe(0);
    expect(soi.length).toBe(0);

    // Verify APP0 / JFIF details
    const app0 = result.segments.find((s) => s.name === 'APP0/JFIF');
    expect(app0.details.identifier).toBe('JFIF');
    expect(app0.details.jfifVersion).toBe('1.02');
    expect(app0.details.densityUnits).toBe(1);
    expect(app0.details.densityUnitsLabel).toBe('Pixels per inch (DPI)');
    expect(app0.details.xDensity).toBe(72);
    expect(app0.details.yDensity).toBe(72);

    // Verify SOF0 details
    const sof0 = result.segments.find((s) => s.name === 'SOF0');
    expect(sof0.details.precision).toBe(8);
    expect(sof0.details.height).toBe(64);
    expect(sof0.details.width).toBe(64);
    expect(sof0.details.componentCount).toBe(3);
    expect(sof0.details.components).toHaveLength(3);

    // Verify SOS
    const sos = result.segments.find((s) => s.name === 'SOS');
    expect(sos.details.componentCount).toBe(3);

    // Verify EOI
    const eoi = result.segments.find((s) => s.name === 'EOI');
    expect(eoi.marker).toBe(0xFFD9);

    // Verify summary image info
    expect(result.imageInfo.width).toBe(64);
    expect(result.imageInfo.height).toBe(64);
    expect(result.imageInfo.precision).toBe(8);
    expect(result.imageInfo.componentCount).toBe(3);
    expect(result.imageInfo.jfifVersion).toBe('1.02');
    expect(result.imageInfo.density).toContain('72 × 72');
  });

  it('throws on null or invalid input type', () => {
    expect(() => parseJpeg(null)).toThrow(TypeError);
    expect(() => parseJpeg(undefined)).toThrow(TypeError);
    expect(() => parseJpeg('string')).toThrow(TypeError);
    expect(() => parseJpeg(12345)).toThrow(TypeError);
  });

  it('throws on buffer shorter than 2 bytes', () => {
    const tiny = new Uint8Array([0xFF]).buffer;
    expect(() => parseJpeg(tiny)).toThrow(
      /file is too small/i,
    );
  });

  it('throws when SOI marker is missing (malformed signature)', () => {
    const notJpeg = new Uint8Array([0x89, 0x50, 0x4E, 0x47]).buffer;
    expect(() => parseJpeg(notJpeg)).toThrow(
      /missing SOI marker/i,
    );
  });

  it('throws on invalid marker length (< 2)', () => {
    const invalidLen = new Uint8Array([
      0xFF, 0xD8, // SOI
      0xFF, 0xE0, // APP0
      0x00, 0x01, // invalid length 1 (< 2)
    ]).buffer;

    expect(() => parseJpeg(invalidLen)).toThrow(
      /Invalid marker length 1/i,
    );
  });

  it('throws on truncated segment header', () => {
    const truncatedHdr = new Uint8Array([
      0xFF, 0xD8, // SOI
      0xFF, 0xE0, // APP0 marker byte with no length bytes following
    ]).buffer;

    expect(() => parseJpeg(truncatedHdr)).toThrow(
      /Truncated segment header/i,
    );
  });

  it('throws on truncated segment payload', () => {
    const truncatedPayload = new Uint8Array([
      0xFF, 0xD8, // SOI
      0xFF, 0xE0, 0x00, 0x10, // APP0 claims length 16 (14 payload bytes)
      0x4A, 0x46, // but only 2 payload bytes exist
    ]).buffer;

    expect(() => parseJpeg(truncatedPayload)).toThrow(
      /Truncated segment/i,
    );
  });

  it('throws on missing marker prefix', () => {
    const corrupted = new Uint8Array([
      0xFF, 0xD8, // SOI
      0x00, 0x12, // not starting with 0xFF
    ]).buffer;

    expect(() => parseJpeg(corrupted)).toThrow(
      /Expected marker prefix 0xFF/i,
    );
  });

  it('throws on truncated APP0 JFIF payload', () => {
    const shortJfif = new Uint8Array([
      0xFF, 0xD8,
      0xFF, 0xE0, 0x00, 0x07, // length 7 (only 5 payload bytes)
      0x4A, 0x46, 0x49, 0x46, 0x00, // "JFIF\0" but no version/density
    ]).buffer;

    expect(() => parseJpeg(shortJfif)).toThrow(
      /Truncated APP0\/JFIF segment/i,
    );
  });

  it('throws on truncated APP0 JFIF thumbnail payload', () => {
    // Exact byte sequence from review:
    // FF D8 FF E0 00 10 4A 46 49 46 00 01 02 01 00 48 00 48 01 01 FF D9
    const truncatedThumbnailJfif = new Uint8Array([
      0xFF, 0xD8, // SOI
      0xFF, 0xE0, 0x00, 0x10, // APP0 length 16 (payload 14)
      0x4A, 0x46, 0x49, 0x46, 0x00, // "JFIF\0"
      0x01, 0x02, // version 1.02
      0x01, // units = DPI
      0x00, 0x48, // X density 72
      0x00, 0x48, // Y density 72
      0x01, 0x01, // 1x1 thumbnail requires 3 RGB payload bytes, but segment ends here
      0xFF, 0xD9, // EOI
    ]).buffer;

    expect(() => parseJpeg(truncatedThumbnailJfif)).toThrow(
      /Truncated APP0\/JFIF segment: expected at least 17 payload bytes for thumbnail data/i,
    );
  });

  it('correctly parses JFIF segment with valid non-zero thumbnail payload', () => {
    const validThumbnailJfif = new Uint8Array([
      0xFF, 0xD8, // SOI
      0xFF, 0xE0, 0x00, 0x13, // APP0 length 19 (payload 17)
      0x4A, 0x46, 0x49, 0x46, 0x00, // "JFIF\0"
      0x01, 0x02, // version 1.02
      0x01, // units = DPI
      0x00, 0x48, // X density 72
      0x00, 0x48, // Y density 72
      0x01, 0x01, // 1x1 thumbnail
      0xFF, 0x00, 0x00, // 3 RGB thumbnail bytes (R, G, B)
      0xFF, 0xD9, // EOI
    ]).buffer;

    const result = parseJpeg(validThumbnailJfif);
    const jfif = result.segments.find((s) => s.name === 'APP0/JFIF');
    expect(jfif.details.thumbnailWidth).toBe(1);
    expect(jfif.details.thumbnailHeight).toBe(1);
  });

  it('throws on truncated SOF segment', () => {
    const shortSof = new Uint8Array([
      0xFF, 0xD8,
      0xFF, 0xC0, 0x00, 0x05, // length 5 (only 3 payload bytes)
      0x08, 0x00, 0x10,
    ]).buffer;

    expect(() => parseJpeg(shortSof)).toThrow(
      /Truncated SOF0 segment/i,
    );
  });

  it('throws on undersized SOS payload without scan header', () => {
    // Exact byte sequence from code review: FF D8 FF DA 00 02 FF D9
    const undersizedSos = new Uint8Array([
      0xFF, 0xD8, // SOI
      0xFF, 0xDA, 0x00, 0x02, // SOS length = 2 (payload = 0 bytes)
      0xFF, 0xD9, // EOI
    ]).buffer;

    expect(() => parseJpeg(undersizedSos)).toThrow(
      /Truncated SOS segment: missing scan header/i,
    );
  });

  it('throws on incomplete SOS scan header with truncated component or parameters', () => {
    const incompleteSos = new Uint8Array([
      0xFF, 0xD8, // SOI
      0xFF, 0xDA, 0x00, 0x05, // SOS length = 5 (payload = 3 bytes)
      0x01, 0x01, 0x00, // componentCount = 1, comp selector + table, missing 3 scan params
      0xFF, 0xD9, // EOI
    ]).buffer;

    expect(() => parseJpeg(incompleteSos)).toThrow(
      /Truncated SOS segment: incomplete scan header/i,
    );
  });

  it('throws on SOS with zero component count', () => {
    // Exact byte sequence from code review: FF D8 FF DA 00 06 00 00 00 00 FF D9
    const zeroComponentSos = new Uint8Array([
      0xFF, 0xD8, // SOI
      0xFF, 0xDA, 0x00, 0x06, // SOS length = 6 (payload = 4 bytes)
      0x00, // componentCount = 0 (invalid Ns)
      0x00, 0x00, 0x00, // Ss, Se, Ah/Al
      0xFF, 0xD9, // EOI
    ]).buffer;

    expect(() => parseJpeg(zeroComponentSos)).toThrow(
      /Invalid SOS segment: scan component count must be at least 1/i,
    );
  });

  it('throws on SOS with component count greater than 4', () => {
    const tooManyComponentsSos = new Uint8Array([
      0xFF, 0xD8, // SOI
      0xFF, 0xDA, 0x00, 0x10, // SOS length = 16 (payload = 14 bytes)
      0x05, // componentCount = 5 (> 4)
      0x01, 0x00, 0x02, 0x00, 0x03, 0x00, 0x04, 0x00, 0x05, 0x00,
      0x00, 0x3F, 0x00,
      0xFF, 0xD9, // EOI
    ]).buffer;

    expect(() => parseJpeg(tooManyComponentsSos)).toThrow(
      /Invalid SOS segment: scan component count must be between 1 and 4/i,
    );
  });

  it('throws on SOS with component count exceeding parsed frame component count', () => {
    const mismatchedSos = new Uint8Array([
      0xFF, 0xD8, // SOI
      // SOF0 with 1 component (grayscale)
      0xFF, 0xC0, 0x00, 0x0B, // length = 11 (payload = 9 bytes)
      0x08, // 8-bit precision
      0x00, 0x20, // height = 32
      0x00, 0x20, // width = 32
      0x01, // 1 component in frame
      0x01, 0x11, 0x00,
      // SOS with 3 components (exceeds frame component count of 1)
      0xFF, 0xDA, 0x00, 0x0C, // length = 12
      0x03, // 3 components in scan
      0x01, 0x00,
      0x02, 0x00,
      0x03, 0x00,
      0x00, 0x3F, 0x00,
      0xFF, 0xD9, // EOI
    ]).buffer;

    expect(() => parseJpeg(mismatchedSos)).toThrow(
      /scan component count \(3\) cannot exceed frame component count \(1\)/i,
    );
  });

  it('parses COM comment segments', () => {
    const commentText = 'Generated by TestSuite';
    const commentBytes = new TextEncoder().encode(commentText);
    const length = 2 + commentBytes.length;

    const buffer = new Uint8Array([
      0xFF, 0xD8, // SOI
      0xFF, 0xFE, (length >> 8) & 0xFF, length & 0xFF,
      ...commentBytes,
      0xFF, 0xD9, // EOI
    ]).buffer;

    const res = parseJpeg(buffer);
    const comSeg = res.segments.find((s) => s.name === 'COM');
    expect(comSeg).toBeDefined();
    expect(comSeg.details.comment).toBe(commentText);
  });

  it('handles APP0 with different density units (aspect ratio vs DPcm)', () => {
    const bufferUnits0 = new Uint8Array([
      0xFF, 0xD8,
      0xFF, 0xE0, 0x00, 0x10,
      0x4A, 0x46, 0x49, 0x46, 0x00,
      0x01, 0x01,
      0x00, // unit 0: None
      0x00, 0x01,
      0x00, 0x01,
      0x00, 0x00,
      0xFF, 0xD9,
    ]).buffer;

    const res0 = parseJpeg(bufferUnits0);
    const app0 = res0.segments.find((s) => s.name === 'APP0/JFIF');
    expect(app0.details.densityUnits).toBe(0);
    expect(app0.details.densityUnitsLabel).toBe('None (aspect ratio)');

    const bufferUnits2 = new Uint8Array([
      0xFF, 0xD8,
      0xFF, 0xE0, 0x00, 0x10,
      0x4A, 0x46, 0x49, 0x46, 0x00,
      0x01, 0x01,
      0x02, // unit 2: DPC
      0x00, 0x64,
      0x00, 0x64,
      0x00, 0x00,
      0xFF, 0xD9,
    ]).buffer;

    const res2 = parseJpeg(bufferUnits2);
    const app2 = res2.segments.find((s) => s.name === 'APP0/JFIF');
    expect(app2.details.densityUnits).toBe(2);
    expect(app2.details.densityUnitsLabel).toBe('Pixels per cm (DPC)');
  });

  it('identifies APP1 Exif segments', () => {
    const buffer = new Uint8Array([
      0xFF, 0xD8,
      0xFF, 0xE1, 0x00, 0x08,
      0x45, 0x78, 0x69, 0x66, 0x00, 0x00, // "Exif\0\0"
      0xFF, 0xD9,
    ]).buffer;

    const res = parseJpeg(buffer);
    const app1 = res.segments.find((s) => s.name === 'APP1/Exif');
    expect(app1).toBeDefined();
    expect(app1.details.identifier).toBe('Exif');
  });

  it('correctly handles fill bytes (consecutive 0xFF)', () => {
    const buffer = new Uint8Array([
      0xFF, 0xD8,
      0xFF, 0xFF, 0xFF, 0xD9, // 0xFF fill bytes before EOI
    ]).buffer;

    const res = parseJpeg(buffer);
    expect(res.segments).toHaveLength(2);
    expect(res.segments[0].name).toBe('SOI');
    expect(res.segments[1].name).toBe('EOI');
  });

  it('throws on truncated JPEG containing only SOI marker (missing EOI)', () => {
    const soiOnly = new Uint8Array([0xFF, 0xD8]).buffer;
    expect(() => parseJpeg(soiOnly)).toThrow(
      /missing terminating EOI marker/i,
    );
  });

  it('throws on truncated JPEG ending after SOS without terminating EOI marker', () => {
    const sample = new Uint8Array(createSampleJpeg());
    const withoutEoi = sample.slice(0, -2).buffer;
    expect(() => parseJpeg(withoutEoi)).toThrow(
      /missing terminating EOI marker/i,
    );
  });

  it('throws on truncated JPEG with header segments but no terminating EOI marker', () => {
    const withoutEoi = new Uint8Array([
      0xFF, 0xD8, // SOI
      0xFF, 0xFE, 0x00, 0x07, 0x48, 0x65, 0x6C, 0x6C, 0x6F, // COM "Hello"
    ]).buffer;
    expect(() => parseJpeg(withoutEoi)).toThrow(
      /missing terminating EOI marker/i,
    );
  });
});

describe('jpeg.utils helpers', () => {
  it('isSofMarker identifies frame markers correctly', () => {
    expect(isSofMarker(0xFFC0)).toBe(true);
    expect(isSofMarker(0xFFC1)).toBe(true);
    expect(isSofMarker(0xFFC2)).toBe(true);
    expect(isSofMarker(0xFFC4)).toBe(false); // DHT
    expect(isSofMarker(0xFFC8)).toBe(false); // JPG
    expect(isSofMarker(0xFFCC)).toBe(false); // DAC
    expect(isSofMarker(0xFFD8)).toBe(false); // SOI
  });

  it('isStandaloneMarker identifies markers without length field', () => {
    expect(isStandaloneMarker(0xFFD8)).toBe(true); // SOI
    expect(isStandaloneMarker(0xFFD9)).toBe(true); // EOI
    expect(isStandaloneMarker(0xFF01)).toBe(true); // TEM
    expect(isStandaloneMarker(0xFFD0)).toBe(true); // RST0
    expect(isStandaloneMarker(0xFFD7)).toBe(true); // RST7
    expect(isStandaloneMarker(0xFFE0)).toBe(false); // APP0
    expect(isStandaloneMarker(0xFFC0)).toBe(false); // SOF0
  });

  it('formatFileSize formats byte amounts into human-readable strings', () => {
    expect(formatFileSize(500)).toBe('500 B');
    expect(formatFileSize(1024)).toBe('1.0 KB');
    expect(formatFileSize(2048)).toBe('2.0 KB');
    expect(formatFileSize(1024 * 1024)).toBe('1.0 MB');
  });

  it('readJpegFile resolves arrayBuffer from File', async () => {
    const file = new File([new Uint8Array([0xFF, 0xD8, 0xFF, 0xD9])], 'test.jpg');
    const buffer = await readJpegFile(file);
    expect(buffer).toBeInstanceOf(ArrayBuffer);
    expect(buffer.byteLength).toBe(4);
  });

  it('readJpegFile rejects when file is missing', async () => {
    await expect(readJpegFile(null)).rejects.toThrow('No file selected.');
  });
});
