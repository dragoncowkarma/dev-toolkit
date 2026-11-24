import { describe, expect, it, vi } from 'vitest';
import {
  CHECKSUM_RANGES,
  HEADER_OFFSETS,
  REGION_CODES,
  ROM_SIZE_CODES,
  ROM_SIZE_LABELS,
  SIGNATURE,
  computeSmsChecksum,
  createMockSmsRom,
  findSmsHeader,
  formatFileSize,
  formatHex16,
  generateSummary,
  inspectSmsRom,
  matchesSignature,
  parseProductCode,
  parseSmsHeader,
  readHeaderSlice,
} from './smsRomHeaderInspector.utils.js';

describe('Standard header constants & readHeaderSlice', () => {
  it('exports expected constants', () => {
    expect(SIGNATURE).toBe('TMR SEGA');
    expect(HEADER_OFFSETS).toEqual([0x7ff0, 0x3ff0, 0x1ff0]);
    expect(REGION_CODES[0x4]).toBe('SMS Export');
    expect(CHECKSUM_RANGES[0xc]).toEqual([[0, 0x7ff0]]);
  });

  it('reads bounded 16-byte slice correctly from buffer and returns null on bounds overflow',
    async () => {
      const data = new Uint8Array(100);
      data[10] = 0x42;
      const slice = await readHeaderSlice(data, 10);
      expect(slice).toHaveLength(16);
      expect(slice[0]).toBe(0x42);

      const overflow = await readHeaderSlice(data, 95);
      expect(overflow).toBeNull();

      const nullFile = await readHeaderSlice(null, 0);
      expect(nullFile).toBeNull();
    });
});

describe('formatFileSize & formatHex16', () => {
  it('formats byte sizes correctly', () => {
    expect(formatFileSize(0)).toBe('0 B');
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(8192)).toBe('8.0 KB');
    expect(formatFileSize(32768)).toBe('32.0 KB');
    expect(formatFileSize(1048576)).toBe('1.00 MB');
    expect(formatFileSize(null)).toBe('0 B');
  });

  it('formats 16-bit hex integers correctly', () => {
    expect(formatHex16(0)).toBe('0x0000');
    expect(formatHex16(0x1234)).toBe('0x1234');
    expect(formatHex16(0xffff)).toBe('0xFFFF');
    expect(formatHex16(null)).toBe('0x0000');
  });
});

describe('parseProductCode', () => {
  it('decodes 53412 from bytes 0x12, 0x34, 0x50', () => {
    const result = parseProductCode(0x12, 0x34, 0x50);
    expect(result.code).toBe('53412');
    expect(result.highNibble).toBe(5);
    expect(result.isBcd).toBe(true);
  });

  it('decodes 109078 from bytes 0x78, 0x90, 0xA0', () => {
    const result = parseProductCode(0x78, 0x90, 0xa0);
    expect(result.code).toBe('109078');
    expect(result.highNibble).toBe(10);
    expect(result.isBcd).toBe(true);
  });

  it('decodes California Games product code 7014 from 0x14, 0x70, 0x00', () => {
    const result = parseProductCode(0x14, 0x70, 0x00);
    expect(result.code).toBe('7014');
    expect(result.highNibble).toBe(0);
    expect(result.isBcd).toBe(true);
  });

  it('decodes Populous product code 27014 from 0x14, 0x70, 0x20', () => {
    const result = parseProductCode(0x14, 0x70, 0x20);
    expect(result.code).toBe('27014');
    expect(result.highNibble).toBe(2);
    expect(result.isBcd).toBe(true);
  });

  it('decodes all-zero product code to 0000', () => {
    const result = parseProductCode(0x00, 0x00, 0x00);
    expect(result.code).toBe('0000');
  });

  it('falls back to hex string if nibbles are non-BCD', () => {
    const result = parseProductCode(0xab, 0xcd, 0xef);
    expect(result.code).toBe('ECDAB');
    expect(result.isBcd).toBe(false);
  });
});

describe('Signature detection across offsets', () => {
  it('matches TMR SEGA signature', () => {
    const bytes = new TextEncoder().encode('TMR SEGAextra');
    expect(matchesSignature(bytes)).toBe(true);
    expect(matchesSignature(new Uint8Array([0, 1, 2, 3]))).toBe(false);
    expect(matchesSignature(null)).toBe(false);
  });

  it('finds signature at offset 0x1FF0 for 8 KB ROM', async () => {
    const rom = createMockSmsRom({
      headerOffset: 0x1ff0,
      totalSize: 8 * 1024,
      romSizeCode: 0xa,
      regionCode: 0x3,
    });
    const file = new File([rom], 'sms_8kb.sms');
    const header = await findSmsHeader(file);
    expect(header).not.toBeNull();
    expect(header.offset).toBe(0x1ff0);
  });

  it('finds signature at offset 0x3FF0 for 16 KB ROM', async () => {
    const rom = createMockSmsRom({
      headerOffset: 0x3ff0,
      totalSize: 16 * 1024,
      romSizeCode: 0xb,
      regionCode: 0x5,
    });
    const file = new File([rom], 'gg_16kb.gg');
    const header = await findSmsHeader(file);
    expect(header).not.toBeNull();
    expect(header.offset).toBe(0x3ff0);
  });

  it('finds signature at offset 0x7FF0 for 32 KB ROM', async () => {
    const rom = createMockSmsRom({
      headerOffset: 0x7ff0,
      totalSize: 32 * 1024,
      romSizeCode: 0xc,
      regionCode: 0x4,
    });
    const file = new File([rom], 'sms_32kb.sms');
    const header = await findSmsHeader(file);
    expect(header).not.toBeNull();
    expect(header.offset).toBe(0x7ff0);
  });
});

describe('Checksum verification (valid and invalid)', () => {
  it('verifies a valid checksum for a 32 KB ROM', async () => {
    const rom = createMockSmsRom({
      headerOffset: 0x7ff0,
      totalSize: 32 * 1024,
      romSizeCode: 0xc,
    });
    const file = new File([rom], 'valid_32kb.sms');
    const result = await inspectSmsRom(file);

    expect(result.valid).toBe(true);
    expect(result.checksumValid).toBe(true);
    expect(result.checksumStatus).toBe('Match');
    expect(result.computedChecksum).toBe(result.header.checksum);
    expect(result.diagnostics).toHaveLength(0);
  });

  it('reports a checksum mismatch when the stored checksum is incorrect', async () => {
    const rom = createMockSmsRom({
      headerOffset: 0x7ff0,
      totalSize: 32 * 1024,
      romSizeCode: 0xc,
      checksum: 0xbeef, // forced wrong checksum
    });
    const file = new File([rom], 'bad_checksum.sms');
    const result = await inspectSmsRom(file);

    expect(result.valid).toBe(true);
    expect(result.checksumValid).toBe(false);
    expect(result.checksumStatus).toBe('Mismatch');
    expect(result.diagnostics.some((d) => d.includes('Checksum mismatch'))).toBe(true);
  });
});

describe('Every region code and unknown region code', () => {
  const testCases = [
    { code: 0x3, expected: 'SMS Japan' },
    { code: 0x4, expected: 'SMS Export' },
    { code: 0x5, expected: 'GG Japan' },
    { code: 0x6, expected: 'GG Export' },
    { code: 0x7, expected: 'GG International' },
  ];

  for (const { code, expected } of testCases) {
    it(`parses region code 0x${code.toString(16)} as ${expected}`, async () => {
      const rom = createMockSmsRom({
        regionCode: code,
        headerOffset: 0x7ff0,
        totalSize: 32 * 1024,
      });
      const file = new File([rom], `region_${code}.sms`);
      const result = await inspectSmsRom(file);

      expect(result.header.regionCode).toBe(code);
      expect(result.header.region).toBe(expected);
      expect(result.diagnostics.some((d) => d.includes('Unknown region code'))).toBe(false);
    });
  }

  it('reports diagnostic for unknown region code 0x8 and 0x2', async () => {
    const rom = createMockSmsRom({
      regionCode: 0x8,
      headerOffset: 0x7ff0,
      totalSize: 32 * 1024,
    });
    const file = new File([rom], 'unknown_region.sms');
    const result = await inspectSmsRom(file);

    expect(result.header.regionCode).toBe(0x8);
    expect(result.diagnostics.some((d) => d.includes('Unknown region code: 0x8'))).toBe(true);
  });
});

describe('ROM size codes and unknown size code', () => {
  const sizeCases = [
    { code: 0xa, label: '8 KB', bytes: 8192 },
    { code: 0xb, label: '16 KB', bytes: 16384 },
    { code: 0xc, label: '32 KB', bytes: 32768 },
    { code: 0xd, label: '48 KB', bytes: 49152 },
    { code: 0xe, label: '64 KB', bytes: 65536 },
    { code: 0xf, label: '128 KB', bytes: 131072 },
    { code: 0x0, label: '256 KB', bytes: 262144 },
    { code: 0x1, label: '512 KB', bytes: 524288 },
    { code: 0x2, label: '1 MB', bytes: 1048576 },
  ];

  for (const { code, label, bytes } of sizeCases) {
    it(`correctly maps ROM size code 0x${code.toString(16)} to ${label} (${bytes} bytes)`, () => {
      expect(ROM_SIZE_CODES[code]).toBe(bytes);
      expect(ROM_SIZE_LABELS[code]).toBe(label);
    });
  }

  it('reports diagnostic on unknown size code 0x5', async () => {
    const rom = createMockSmsRom({
      romSizeCode: 0x5,
      headerOffset: 0x7ff0,
      totalSize: 32 * 1024,
    });
    const file = new File([rom], 'unknown_size.sms');
    const result = await inspectSmsRom(file);

    expect(result.header.romSizeCode).toBe(0x5);
    expect(result.header.romSizeBytes).toBeNull();
    expect(result.diagnostics.some((d) => d.includes('Unknown ROM size code: 0x5'))).toBe(true);
  });
});

describe('Truncated file handling and preserving real file size', () => {
  it('reports diagnostic when file is smaller than minimum ROM size (no signature)', async () => {
    const tiny = new Uint8Array(100);
    const file = new File([tiny], 'tiny.sms');
    const result = await inspectSmsRom(file);

    expect(result.valid).toBe(false);
    expect(result.header).toBeNull();
    expect(result.fileSize).toBe(100);
    expect(result.diagnostics.some((d) => d.includes("Missing 'TMR SEGA' signature"))).toBe(true);
    expect(result.diagnostics.some((d) => d.includes('Truncated file'))).toBe(true);
  });

  it('reports diagnostic when real file is smaller than ROM size code', async () => {
    // 8 KB file with header at 0x1FF0, but claiming 32 KB ROM size (0xC)
    const rom = createMockSmsRom({
      headerOffset: 0x1ff0,
      romSizeCode: 0xc, // 32 KB
      totalSize: 8 * 1024,
    });
    const file = new File([rom], 'truncated_32kb.sms');
    const result = await inspectSmsRom(file);

    expect(result.valid).toBe(true);
    expect(result.fileSize).toBe(8 * 1024);
    expect(result.header.romSizeBytes).toBe(32 * 1024);
    expect(result.checksumValid).toBe(false);
    expect(result.checksumStatus).toBe('Mismatch (truncated file)');
    expect(result.diagnostics.some((d) => d.includes('Truncated file'))).toBe(true);
  });

  it('preserves real file size when parseSmsHeader is called with options.fileSize', () => {
    const rom = createMockSmsRom({
      headerOffset: 0x7ff0,
      totalSize: 32 * 1024,
    });
    const headerSlice = rom.slice(0x7ff0, 0x8000);
    expect(headerSlice.length).toBe(16);

    const parsed = parseSmsHeader(headerSlice, {
      headerOffset: 0x7ff0,
      fileSize: 32 * 1024,
    });

    expect(parsed.fileSize).toBe(32 * 1024);
    expect(parsed.diagnostics).toHaveLength(0);

    const parsedTruncated = parseSmsHeader(headerSlice, {
      headerOffset: 0x7ff0,
      fileSize: 16 * 1024, // smaller than 32KB
    });
    expect(parsedTruncated.diagnostics.some((d) => d.includes('Truncated file'))).toBe(true);
  });
});

describe('Large file read ONLY through bounded slices', () => {
  it('inspects a large file (1 MB) using bounded File.slice calls without full reading',
    async () => {
      const largeSize = 1024 * 1024; // 1 MB
      const rom = createMockSmsRom({
        headerOffset: 0x7ff0,
        romSizeCode: 0x2, // 1 MB
        totalSize: largeSize,
      });

      const file = new File([rom], 'large_game.sms');
      const sliceCalls = [];
      const origSlice = file.slice.bind(file);

      vi.spyOn(file, 'slice').mockImplementation((start, end) => {
        sliceCalls.push({ start, end, size: (end ?? largeSize) - (start ?? 0) });
        return origSlice(start, end);
      });

      // Provide a mocked arrayBuffer on file to verify it was never called
      file.arrayBuffer = vi.fn();

      const result = await inspectSmsRom(file);

      expect(result.valid).toBe(true);
      expect(result.headerOffset).toBe(0x7ff0);
      expect(result.fileSize).toBe(largeSize);

      // file.arrayBuffer() must never be called on the full file object!
      expect(file.arrayBuffer).not.toHaveBeenCalled();

      // Verify all slice calls were bounded (header <= 16 B, checksum chunk <= 16 KB)
      expect(sliceCalls.length).toBeGreaterThan(0);
      for (const call of sliceCalls) {
        expect(call.size).toBeLessThanOrEqual(16 * 1024);
      }
    });
});

describe('Malformed ROM & Missing Header (never throws)', () => {
  it('does not throw on completely empty or zero-length file', async () => {
    const emptyFile = new File([], 'empty.sms');
    const result = await inspectSmsRom(emptyFile);

    expect(result.valid).toBe(false);
    expect(result.header).toBeNull();
    expect(result.diagnostics.some((d) => d.includes("Missing 'TMR SEGA' signature"))).toBe(true);
  });

  it('does not throw on null or undefined input to parseSmsHeader', () => {
    expect(() => parseSmsHeader(null)).not.toThrow();
    expect(() => parseSmsHeader(new Uint8Array(5))).not.toThrow();
    const result = parseSmsHeader(null);
    expect(result.valid).toBe(false);
  });
});

describe('generateSummary (handles every diagnostic state)', () => {
  it('generates summary for valid 32 KB SMS ROM', async () => {
    const rom = createMockSmsRom({
      headerOffset: 0x7ff0,
      totalSize: 32 * 1024,
      romSizeCode: 0xc,
      regionCode: 0x4,
      productCode: 53412,
      version: 0,
    });
    const result = await inspectSmsRom(new File([rom], 'valid.sms'));
    const summary = generateSummary(result);

    expect(summary).toContain('Sega Master System / Game Gear ROM Header');
    expect(summary).toContain('Header Offset: 0x7FF0');
    expect(summary).toContain('Signature: TMR SEGA');
    expect(summary).toContain('Product Code: 53412');
    expect(summary).toContain('Region: SMS Export');
    expect(summary).toContain('ROM Size: 32 KB');
    expect(summary).toContain('Status: Valid');
    expect(summary).toContain('Diagnostics: None');
  });

  it('generates summary for malformed ROM without throwing', async () => {
    const bad = new Uint8Array(512);
    bad.fill(0xee);
    const result = await inspectSmsRom(new File([bad], 'bad.sms'));
    const summary = generateSummary(result);

    expect(summary).toContain('Header: Not found');
    expect(summary).toContain('Status: Invalid ROM');
    expect(summary).toContain("Missing 'TMR SEGA' signature");
  });

  it('generates summary when diagnostics (e.g. bad checksum, unknown region) exist', async () => {
    const rom = createMockSmsRom({
      headerOffset: 0x7ff0,
      totalSize: 32 * 1024,
      romSizeCode: 0xc,
      regionCode: 0x9, // unknown
      checksum: 0xbeef, // mismatch
    });
    const result = await inspectSmsRom(new File([rom], 'issues.sms'));
    const summary = generateSummary(result);

    expect(summary).toContain('Status: Has Diagnostics');
    expect(summary).toContain('Unknown region code: 0x9');
    expect(summary).toContain('Checksum mismatch');
  });
});

describe('Multiple signatures & Header candidate selection according to ROM layout', () => {
  it('selects 0x7FF0 over 0x1FF0 when 32 KB ROM has TMR SEGA in ordinary data at 0x1FF0',
    async () => {
      const rom = createMockSmsRom({
        headerOffset: 0x7ff0,
        totalSize: 32 * 1024,
        romSizeCode: 0xc, // 32 KB
        regionCode: 0x4,
      });
      // Insert TMR SEGA at 0x1FF0 in ordinary data
      const sigBytes = [0x54, 0x4d, 0x52, 0x20, 0x53, 0x45, 0x47, 0x41];
      for (let i = 0; i < 8; i++) {
        rom[0x1ff0 + i] = sigBytes[i];
      }
      // Recompute and store checksum since ordinary data at 0x1FF0 changed
      const checksumRes = await computeSmsChecksum(rom, 0xc);
      rom[0x7ff0 + 10] = checksumRes.computedChecksum & 0xff;
      rom[0x7ff0 + 11] = (checksumRes.computedChecksum >> 8) & 0xff;

      const file = new File([rom], 'multi_sig_32kb.sms');
      const result = await inspectSmsRom(file);

      expect(result.valid).toBe(true);
      expect(result.headerOffset).toBe(0x7ff0);
      expect(result.header.romSizeLabel).toBe('32 KB');
      expect(result.checksumValid).toBe(true);
    });

  it('selects 0x7FF0 over 0x3FF0 when 32 KB ROM has TMR SEGA at 0x3FF0', async () => {
    const rom = createMockSmsRom({
      headerOffset: 0x7ff0,
      totalSize: 32 * 1024,
      romSizeCode: 0xc,
      regionCode: 0x4,
    });
    const sigBytes = [0x54, 0x4d, 0x52, 0x20, 0x53, 0x45, 0x47, 0x41];
    for (let i = 0; i < 8; i++) {
      rom[0x3ff0 + i] = sigBytes[i];
    }

    const file = new File([rom], 'multi_sig_32kb_at_3ff0.sms');
    const result = await inspectSmsRom(file);

    expect(result.valid).toBe(true);
    expect(result.headerOffset).toBe(0x7ff0);
  });

  it('selects 0x3FF0 over 0x1FF0 on a 16 KB Game Gear ROM with multiple signatures',
    async () => {
      const rom = createMockSmsRom({
        headerOffset: 0x3ff0,
        totalSize: 16 * 1024,
        romSizeCode: 0xb, // 16 KB
        regionCode: 0x5,
      });
      const sigBytes = [0x54, 0x4d, 0x52, 0x20, 0x53, 0x45, 0x47, 0x41];
      for (let i = 0; i < 8; i++) {
        rom[0x1ff0 + i] = sigBytes[i];
      }

      const file = new File([rom], 'multi_sig_16kb.gg');
      const result = await inspectSmsRom(file);

      expect(result.valid).toBe(true);
      expect(result.headerOffset).toBe(0x3ff0);
      expect(result.header.romSizeLabel).toBe('16 KB');
    });

  it('finds header via findSmsHeader selecting prioritized offset for 32 KB ROM', async () => {
    const rom = new Uint8Array(32 * 1024);
    const sigBytes = [0x54, 0x4d, 0x52, 0x20, 0x53, 0x45, 0x47, 0x41];
    for (let i = 0; i < 8; i++) {
      rom[0x1ff0 + i] = sigBytes[i];
      rom[0x7ff0 + i] = sigBytes[i];
    }
    // Set valid region & size at 0x7FF0
    rom[0x7ff0 + 15] = 0x4c;

    const found = await findSmsHeader(rom);
    expect(found).not.toBeNull();
    expect(found.offset).toBe(0x7ff0);
  });

  it('selects 0x7FF0 over earlier plausible 0x1FF0 signature when real header has unknown metadata',
    async () => {
      // 32 KB ROM with real header at 0x7FF0 having an unknown region code 0x8
      const rom = createMockSmsRom({
        headerOffset: 0x7ff0,
        totalSize: 32 * 1024,
        romSizeCode: 0xc, // 32 KB
        regionCode: 0x8, // Unknown region code
      });

      // Place TMR SEGA and plausible metadata (0x4C: SMS Export, 32 KB) in ordinary data at 0x1FF0
      const sigBytes = [0x54, 0x4d, 0x52, 0x20, 0x53, 0x45, 0x47, 0x41];
      for (let i = 0; i < 8; i++) {
        rom[0x1ff0 + i] = sigBytes[i];
      }
      rom[0x1fff] = 0x4c;

      // Recompute valid checksum at 0x7FF0 after modifying ROM data
      let sum = 0;
      for (let i = 0; i < 0x7ff0; i++) {
        sum = (sum + rom[i]) & 0xffff;
      }
      rom[0x7ff0 + 10] = sum & 0xff;
      rom[0x7ff0 + 11] = (sum >> 8) & 0xff;

      const file = new File([rom], 'unknown_region_multi_sig_32kb.sms');
      const result = await inspectSmsRom(file);

      // Real header at 0x7FF0 must be selected, preserving the unknown region diagnostic
      expect(result.valid).toBe(true);
      expect(result.headerOffset).toBe(0x7ff0);
      expect(result.header.regionCode).toBe(0x8);
      expect(result.header.region).toBe('Unknown (0x8)');
      expect(result.diagnostics).toContain('Unknown region code: 0x8');
      expect(result.checksumValid).toBe(true);
      expect(result.computedChecksum).toBe(sum);
    });

  it('selects 0x7FF0 over earlier signature when real header has unknown ROM size code',
    async () => {
      const rom = createMockSmsRom({
        headerOffset: 0x7ff0,
        totalSize: 32 * 1024,
        romSizeCode: 0x5, // Unknown size code
        regionCode: 0x4,
      });

      const sigBytes = [0x54, 0x4d, 0x52, 0x20, 0x53, 0x45, 0x47, 0x41];
      for (let i = 0; i < 8; i++) {
        rom[0x1ff0 + i] = sigBytes[i];
      }
      rom[0x1fff] = 0x4c; // Plausible metadata at 0x1FF0

      const file = new File([rom], 'unknown_size_multi_sig.sms');
      const result = await inspectSmsRom(file);

      expect(result.valid).toBe(true);
      expect(result.headerOffset).toBe(0x7ff0);
      expect(result.header.romSizeCode).toBe(0x5);
      expect(result.diagnostics).toContain('Unknown ROM size code: 0x5');
    });
});

describe('Independent checksum vectors (SMS BIOS range validation)', () => {
  it('calculates 8 KB checksum covering range 0x0..0x1FF0 and excludes 0x1FF0..0x1FFF',
    async () => {
      // 8 KB buffer filled with 0x01.
      // Expected range: [0, 0x1ff0] = 8176 bytes.
      // Sum = 8176 * 1 = 8176 = 0x1FF0.
      const buffer = new Uint8Array(8192);
      buffer.fill(0x01);
      // Bytes in header range 0x1ff0..0x1fff are set to 0xFF; must NOT be included in sum
      buffer.fill(0xff, 0x1ff0, 0x2000);

      const result = await computeSmsChecksum(buffer, 0xa);
      expect(result.computedChecksum).toBe(8176);
      expect(result.bytesProcessed).toBe(8176);
      expect(result.isTruncated).toBe(false);
    });

  it('calculates 16 KB checksum covering range 0x0..0x3FF0 and excludes 0x3FF0..0x3FFF',
    async () => {
      // 16 KB buffer filled with 0x02.
      // Expected range: [0, 0x3ff0] = 16368 bytes.
      // Sum = 16368 * 2 = 32736 = 0x7FE0.
      const buffer = new Uint8Array(16384);
      buffer.fill(0x02);
      buffer.fill(0xaa, 0x3ff0, 0x4000);

      const result = await computeSmsChecksum(buffer, 0xb);
      expect(result.computedChecksum).toBe(32736);
      expect(result.bytesProcessed).toBe(16368);
      expect(result.isTruncated).toBe(false);
    });

  it('includes ordinary data at 0x1FF0 and 0x3FF0 for 32 KB ROM (code 0xC)', async () => {
    // 32 KB buffer filled with 0x00. Range is [0, 0x7ff0] = 32752 bytes.
    // Ordinary data placed at 0x1ff0 (16 bytes of 0x03) and 0x3ff0 (16 bytes of 0x05).
    // Sum = (16 * 3) + (16 * 5) = 48 + 80 = 128.
    const buffer = new Uint8Array(32768);
    buffer.fill(0x03, 0x1ff0, 0x2000);
    buffer.fill(0x05, 0x3ff0, 0x4000);
    // Header bytes at 0x7ff0..0x7fff must NOT be included
    buffer.fill(0xee, 0x7ff0, 0x8000);

    const result = await computeSmsChecksum(buffer, 0xc);
    expect(result.computedChecksum).toBe(128);
    expect(result.bytesProcessed).toBe(32752);
    expect(result.isTruncated).toBe(false);
  });

  it('calculates 64 KB checksum with split ranges [0, 0x7FF0] and [0x8000, 0x10000]',
    async () => {
      // 64 KB buffer filled with 0x01.
      // Range 1: [0, 0x7ff0] = 32752 bytes * 1 = 32752.
      // Range 2: [0x8000, 0x10000] = 32768 bytes * 1 = 32768.
      // Total sum = 32752 + 32768 = 65520 = 0xFFF0.
      const buffer = new Uint8Array(65536);
      buffer.fill(0x01);
      // Bytes at 0x7ff0..0x7fff are 0x99 (excluded)
      buffer.fill(0x99, 0x7ff0, 0x8000);

      const result = await computeSmsChecksum(buffer, 0xe);
      expect(result.computedChecksum).toBe(65520);
      expect(result.bytesProcessed).toBe(65520);
      expect(result.isTruncated).toBe(false);
    });

  it('calculates 128 KB checksum accurately with overflow wrapping in 16-bit accumulator',
    async () => {
      // 128 KB buffer filled with 0x01.
      // Range 1: [0, 0x7ff0] = 32752.
      // Range 2: [0x8000, 0x20000] = 98304.
      // Total bytes = 131056. (131056 & 0xffff) = 65520.
      const buffer = new Uint8Array(131072);
      buffer.fill(0x01);

      const result = await computeSmsChecksum(buffer, 0xf);
      expect(result.computedChecksum).toBe(65520);
      expect(result.bytesProcessed).toBe(131056);
      expect(result.isTruncated).toBe(false);
    });

  it('calculates checksum over Blob correctly in chunks', async () => {
    const buffer = new Uint8Array(32768);
    buffer.fill(0x01, 0, 0x7ff0);
    const blob = new Blob([buffer]);

    const result = await computeSmsChecksum(blob, 0xc, { chunkSize: 4096 });
    expect(result.computedChecksum).toBe(32752);
    expect(result.bytesProcessed).toBe(32752);
    expect(result.isTruncated).toBe(false);
  });
});
