import { describe, expect, it, vi } from 'vitest';
import {
  ORIENTATION_DESCRIPTIONS,
  buildSampleRadianceHdrBytes,
  detectScanlineEncoding,
  formatFileSize,
  parseRadianceHdrHeader,
  parseResolutionLine,
  readLeadingHeaderBytes,
} from './radianceHdrHeaderInspector.utils.js';

function makeHdrBytes(lines, scanlineBytes = []) {
  const headerText = `${lines.join('\n')}\n`;
  const headerBuf = new TextEncoder().encode(headerText);
  const tail = new Uint8Array(scanlineBytes);
  const out = new Uint8Array(headerBuf.length + tail.length);
  out.set(headerBuf, 0);
  out.set(tail, headerBuf.length);
  return out;
}

describe('parseRadianceHdrHeader - valid RGBE and XYZE headers', () => {
  it('parses a valid #?RADIANCE 32-bit_rle_rgbe header with variables and new RLE', () => {
    // Width = 768 (0x0300) -> new RLE prefix is [2, 2, 0x03, 0x00]
    const bytes = makeHdrBytes(
      [
        '#?RADIANCE',
        '# Created by Radiance rpict',
        'SOFTWARE=Radiance 5.4',
        'FORMAT=32-bit_rle_rgbe',
        'EXPOSURE=2.5',
        'COLORCORR=0.95 1.00 1.05',
        'PRIMARIES=0.6400 0.3300 0.2900 0.6000 0.1500 0.0600 0.3333 0.3333',
        '',
        '-Y 512 +X 768',
      ],
      [0x02, 0x02, 0x03, 0x00, 0x84, 0x20, 0x10, 0x80],
    );

    const parsed = parseRadianceHdrHeader(bytes);
    expect(parsed.magic).toBe('#?RADIANCE');
    expect(parsed.format).toBe('32-bit_rle_rgbe');
    expect(parsed.colorSpace).toBe('RGBE');
    expect(parsed.software).toBe('Radiance 5.4');
    expect(parsed.exposure).toBeCloseTo(2.5);
    expect(parsed.colorCorr).toEqual([0.95, 1.0, 1.05]);
    expect(parsed.primaries).toEqual([
      0.64, 0.33, 0.29, 0.6, 0.15, 0.06, 0.3333, 0.3333,
    ]);
    expect(parsed.comments).toEqual(['Created by Radiance rpict']);
    expect(parsed.orientation).toBe('-Y +X');
    expect(parsed.width).toBe(768);
    expect(parsed.height).toBe(512);
    expect(parsed.scanlineEncoding).toBe('new RLE');
  });

  it('parses a valid #?RGBE 32-bit_rle_xyze header and cumulative EXPOSURE values', () => {
    // Width = 256 (0x0100) -> new RLE prefix is [2, 2, 0x01, 0x00]
    const bytes = makeHdrBytes(
      [
        '#?RGBE',
        'FORMAT=32-bit_rle_xyze',
        'EXPOSURE=2.0',
        'EXPOSURE=0.25',
        'PIXASPECT=1.5',
        '',
        '-Y 128 +X 256',
      ],
      [0x02, 0x02, 0x01, 0x00],
    );

    const parsed = parseRadianceHdrHeader(bytes);
    expect(parsed.magic).toBe('#?RGBE');
    expect(parsed.format).toBe('32-bit_rle_xyze');
    expect(parsed.colorSpace).toBe('XYZE');
    expect(parsed.exposure).toBeCloseTo(0.5);
    expect(parsed.pixelAspect).toBeCloseTo(1.5);
    expect(parsed.width).toBe(256);
    expect(parsed.height).toBe(128);
    expect(parsed.scanlineEncoding).toBe('new RLE');
  });

  it('handles CRLF line endings cleanly', () => {
    const crlfHeader =
      '#?RADIANCE\r\nFORMAT=32-bit_rle_rgbe\r\nSOFTWARE=TestCRLF\r\n\r\n-Y 64 +X 128\r\n';
    const parsed = parseRadianceHdrHeader(crlfHeader);
    expect(parsed.magic).toBe('#?RADIANCE');
    expect(parsed.format).toBe('32-bit_rle_rgbe');
    expect(parsed.software).toBe('TestCRLF');
    expect(parsed.width).toBe(128);
    expect(parsed.height).toBe(64);
  });
});

describe('parseResolutionLine - all 8 orientations', () => {
  const cases = [
    {
      line: '-Y 512 +X 768',
      orientation: '-Y +X',
      width: 768,
      height: 512,
      majorAxis: 'Y',
      minorAxis: 'X',
      scanlineCount: 512,
      scanlineLength: 768,
    },
    {
      line: '-Y 512 -X 768',
      orientation: '-Y -X',
      width: 768,
      height: 512,
      majorAxis: 'Y',
      minorAxis: 'X',
      scanlineCount: 512,
      scanlineLength: 768,
    },
    {
      line: '+Y 512 +X 768',
      orientation: '+Y +X',
      width: 768,
      height: 512,
      majorAxis: 'Y',
      minorAxis: 'X',
      scanlineCount: 512,
      scanlineLength: 768,
    },
    {
      line: '+Y 512 -X 768',
      orientation: '+Y -X',
      width: 768,
      height: 512,
      majorAxis: 'Y',
      minorAxis: 'X',
      scanlineCount: 512,
      scanlineLength: 768,
    },
    {
      line: '+X 768 -Y 512',
      orientation: '+X -Y',
      width: 768,
      height: 512,
      majorAxis: 'X',
      minorAxis: 'Y',
      scanlineCount: 768,
      scanlineLength: 512,
    },
    {
      line: '-X 768 -Y 512',
      orientation: '-X -Y',
      width: 768,
      height: 512,
      majorAxis: 'X',
      minorAxis: 'Y',
      scanlineCount: 768,
      scanlineLength: 512,
    },
    {
      line: '+X 768 +Y 512',
      orientation: '+X +Y',
      width: 768,
      height: 512,
      majorAxis: 'X',
      minorAxis: 'Y',
      scanlineCount: 768,
      scanlineLength: 512,
    },
    {
      line: '-X 768 +Y 512',
      orientation: '-X +Y',
      width: 768,
      height: 512,
      majorAxis: 'X',
      minorAxis: 'Y',
      scanlineCount: 768,
      scanlineLength: 512,
    },
  ];

  it.each(cases)(
    'parses orientation $orientation from "$line"',
    ({
      line,
      orientation,
      width,
      height,
      majorAxis,
      minorAxis,
      scanlineCount,
      scanlineLength,
    }) => {
      const result = parseResolutionLine(line);
      expect(result.orientation).toBe(orientation);
      expect(result.orientationDescription).toBe(
        ORIENTATION_DESCRIPTIONS[orientation],
      );
      expect(result.width).toBe(width);
      expect(result.height).toBe(height);
      expect(result.majorAxis).toBe(majorAxis);
      expect(result.minorAxis).toBe(minorAxis);
      expect(result.scanlineCount).toBe(scanlineCount);
      expect(result.scanlineLength).toBe(scanlineLength);
    },
  );

  it('rejects duplicate axes or malformed resolution lines', () => {
    expect(() => parseResolutionLine('-Y 512 +Y 768')).toThrow(
      /Axes must include both X and Y/,
    );
    expect(() => parseResolutionLine('512 x 768')).toThrow(
      /Invalid Radiance HDR resolution line/,
    );
    expect(() => parseResolutionLine('-Y 0 +X 768')).toThrow(
      /width and height must be positive integers/,
    );
  });
});

describe('detectScanlineEncoding - flat, old RLE, and new RLE', () => {
  it('detects new RLE when scanline starts with [2, 2, hi, lo] matching scanlineLength', () => {
    const prefix = new Uint8Array([0x02, 0x02, 0x02, 0x00, 0x10, 0x20, 0x30, 0x80]);
    expect(detectScanlineEncoding(prefix, 512)).toBe('new RLE');
  });

  it.each([0, 1, 2, 3])('returns unknown when only %i scanline bytes are available', (n) => {
    const bytes = new Uint8Array([0x02, 0x02, 0x02, 0x00]).subarray(0, n);
    expect(detectScanlineEncoding(bytes, 512)).toBe('unknown');
  });

  it('reports unknown and available byte count for a header-only file', () => {
    const bytes = makeHdrBytes(
      ['#?RADIANCE', 'FORMAT=32-bit_rle_rgbe', '', '-Y 4 +X 64'],
      [0x02, 0x02],
    );
    const parsed = parseRadianceHdrHeader(bytes);
    expect(parsed.scanlineEncoding).toBe('unknown');
    expect(parsed.scanlineBytesAvailable).toBe(2);
  });

  it('detects old RLE when a subsequent pixel entry has R=1, G=1, B=1 repeat marker', () => {
    const prefix = new Uint8Array([
      120, 80, 40, 128,
      1, 1, 1, 15,
    ]);
    expect(detectScanlineEncoding(prefix, 64)).toBe('old RLE');
  });

  it('does not treat a first-record 1,1,1 dark pixel as an old RLE repeat marker', () => {
    const prefix = new Uint8Array([
      1, 1, 1, 120,
      130, 90, 50, 129,
    ]);
    expect(detectScanlineEncoding(prefix, 64)).toBe('flat');
  });

  it('detects flat scanlines when bytes are uncompressed RGBE pixels', () => {
    const prefix = new Uint8Array([
      120, 80, 40, 128,
      130, 90, 50, 129,
    ]);
    expect(detectScanlineEncoding(prefix, 64)).toBe('flat');
  });
});

describe('parseRadianceHdrHeader - error handling', () => {
  it('throws a clear error when the magic line is missing or invalid', () => {
    expect(() => parseRadianceHdrHeader(new Uint8Array(0))).toThrow(
      /Missing Radiance HDR magic line/,
    );
    expect(() =>
      parseRadianceHdrHeader('FORMAT=32-bit_rle_rgbe\n\n-Y 10 +X 10\n'),
    ).toThrow(/Missing Radiance HDR magic line/);
    expect(() =>
      parseRadianceHdrHeader('PNG\r\n'),
    ).toThrow(/Missing Radiance HDR magic line/);
  });

  it('throws a clear error for an unsupported or missing FORMAT', () => {
    const badFormat = makeHdrBytes([
      '#?RADIANCE',
      'FORMAT=16-bit_half_float',
      '',
      '-Y 64 +X 64',
    ]);
    expect(() => parseRadianceHdrHeader(badFormat)).toThrow(
      /Unsupported Radiance HDR format "16-bit_half_float"/,
    );

    const missingFormat = makeHdrBytes([
      '#?RADIANCE',
      'EXPOSURE=1.0',
      '',
      '-Y 64 +X 64',
    ]);
    expect(() => parseRadianceHdrHeader(missingFormat)).toThrow(
      /Unsupported or missing Radiance HDR FORMAT/,
    );
  });

  it('throws a clear error for truncated headers', () => {
    // No newline after magic
    expect(() =>
      parseRadianceHdrHeader(new TextEncoder().encode('#?RADIANCE')),
    ).toThrow(/Truncated Radiance HDR header/);

    // No blank line before EOF
    expect(() =>
      parseRadianceHdrHeader('#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n'),
    ).toThrow(/Truncated Radiance HDR header/);

    // Blank line present, but missing resolution line
    expect(() =>
      parseRadianceHdrHeader('#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n'),
    ).toThrow(/Truncated Radiance HDR header/);

    // Incomplete resolution line without trailing LF
    expect(() =>
      parseRadianceHdrHeader('#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y 512 +X 768'),
    ).toThrow(/Truncated Radiance HDR header/);
  });
});

describe('readLeadingHeaderBytes and helpers', () => {
  it('slices and reads only the requested leading bytes from a File', async () => {
    const sample = buildSampleRadianceHdrBytes('rgbe');
    const file = new File([sample], 'scene.hdr', {
      type: 'image/vnd.radiance',
    });
    const sliceSpy = vi.spyOn(file, 'slice');

    const bytes = await readLeadingHeaderBytes(file, 64);
    expect(sliceSpy).toHaveBeenCalledWith(0, 64);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBe(64);
  });

  it('formats file sizes cleanly', () => {
    expect(formatFileSize(500)).toBe('500 B');
    expect(formatFileSize(2048)).toBe('2.0 KB');
  });
});
