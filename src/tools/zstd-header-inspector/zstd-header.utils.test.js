import { describe, expect, it } from 'vitest';
import { parseZstdFrameHeader } from './zstd-header.utils.js';

const MAGIC = [0x28, 0xB5, 0x2F, 0xFD];

describe('parseZstdFrameHeader', () => {
  it('parses the header of a zstd CLI-compressed hello sample', () => {
    // `printf hello | zstd -q -c` begins 28b52ffd0458 (zstd 1.5.7).
    const result = parseZstdFrameHeader(new Uint8Array([...MAGIC, 0x04, 0x58]));

    expect(result.status).toBe('valid');
    expect(result.fields.frameHeaderDescriptor.contentChecksumFlag).toBe(true);
    expect(result.fields.windowDescriptor.raw).toBe(0x58);
    expect(result.fields.frameContentSize).toBeUndefined();
  });

  it('parses a known-good single-segment frame header', () => {
    const result = parseZstdFrameHeader(new Uint8Array([...MAGIC, 0x20, 0x05]));

    expect(result.status).toBe('valid');
    expect(result.fields.frameHeaderDescriptor).toMatchObject({
      frameContentSizeFlag: 0,
      singleSegment: true,
      contentChecksumFlag: false,
    });
    expect(result.fields.frameContentSize).toBe(5n);
    expect(result.fields.windowDescriptor).toBeUndefined();
  });

  it('parses a normal frame header with window descriptor and content checksum', () => {
    const result = parseZstdFrameHeader(new Uint8Array([...MAGIC, 0x44, 0x00, 0x2C, 0x00]));

    expect(result.status).toBe('valid');
    expect(result.fields.windowDescriptor).toMatchObject({ raw: 0, windowSize: 1024 });
    expect(result.fields.frameHeaderDescriptor.contentChecksumFlag).toBe(true);
    expect(result.fields.frameContentSize).toBe(300n);
  });

  it('uses BigInt for eight-byte frame content sizes', () => {
    const result = parseZstdFrameHeader(new Uint8Array([
      ...MAGIC, 0xC0, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x20, 0x00,
    ]));

    expect(result.status).toBe('valid');
    expect(result.fields.frameContentSize).toBe(9007199254740993n);
  });

  it('parses a present four-byte dictionary ID', () => {
    const result = parseZstdFrameHeader(new Uint8Array([
      ...MAGIC, 0x23, 0x78, 0x56, 0x34, 0x12, 0x09,
    ]));

    expect(result.status).toBe('valid');
    expect(result.fields.dictionaryId).toBe(0x12345678n);
    expect(result.fields.frameContentSize).toBe(9n);
  });

  it('returns field-specific warnings for truncated input', () => {
    expect(parseZstdFrameHeader(new Uint8Array([...MAGIC, 0x20])).warnings[0])
      .toMatch(/Frame Content Size is truncated/);
    expect(parseZstdFrameHeader(new Uint8Array([0x28, 0xB5])).warnings[0])
      .toMatch(/Magic Number is truncated/);
  });

  it('distinguishes invalid, skippable, and legacy magic values', () => {
    expect(parseZstdFrameHeader(new Uint8Array([1, 2, 3, 4])).status).toBe('invalid');
    expect(parseZstdFrameHeader(new Uint8Array([0x50, 0x2A, 0x4D, 0x18])).status)
      .toBe('skippable');
    const legacy = parseZstdFrameHeader(new Uint8Array([0x02, 0x21, 0x4C, 0x18]));
    expect(legacy.status).toBe('legacy');
    expect(legacy.warnings[0]).toBe('Unsupported legacy format.');
  });
});
