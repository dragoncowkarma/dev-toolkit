import { describe, expect, it } from 'vitest';
import { parseZstdFrameHeader } from './zstd-header-inspector.utils.js';

const MAGIC = [0x28, 0xb5, 0x2f, 0xfd];

describe('parseZstdFrameHeader', () => {
  it('parses a valid single-segment frame', () => {
    const result = parseZstdFrameHeader(new Uint8Array([...MAGIC, 0x20, 0x2a]));

    expect(result.kind).toBe('standard');
    expect(result.descriptor.singleSegment).toBe(true);
    expect(result.frameContentSize).toBe(42n);
    expect(result.headerSize).toBe(6);
  });

  it('parses a frame with an explicit Window_Descriptor', () => {
    const result = parseZstdFrameHeader(new Uint8Array([...MAGIC, 0x00, 0x15]));

    expect(result.windowDescriptor).toMatchObject({ exponent: 2, mantissa: 5 });
    expect(result.windowDescriptor.windowSize).toBe(6656);
  });

  it('parses a Dictionary_ID when its flag is present', () => {
    const result = parseZstdFrameHeader(new Uint8Array([...MAGIC, 0x21, 0x34, 0x00]));

    expect(result.dictionaryId).toBe(0x34);
    expect(result.dictionaryIdLength).toBe(1);
    expect(result.frameContentSize).toBe(0n);
  });

  it('parses a two-byte Frame_Content_Size with its required adjustment', () => {
    const result = parseZstdFrameHeader(new Uint8Array([...MAGIC, 0x60, 0x2c, 0x01]));

    expect(result.descriptor.frameContentSizeFlag).toBe(1);
    expect(result.frameContentSize).toBe(556n);
    expect(result.frameContentSizeLength).toBe(2);
  });

  it('rejects a non-Zstandard magic number', () => {
    expect(() => parseZstdFrameHeader(new Uint8Array([0, 0, 0, 0]))).toThrow(/magic number/i);
  });

  it('reports a readable error for a truncated frame', () => {
    expect(() => parseZstdFrameHeader(new Uint8Array([...MAGIC, 0x60, 0x01]))).toThrow(
      /Truncated Zstandard frame/,
    );
  });

  it('labels a skippable-frame magic value without parsing content', () => {
    const result = parseZstdFrameHeader(new Uint8Array([0x5f, 0x2a, 0x4d, 0x18]));

    expect(result).toMatchObject({
      kind: 'skippable',
      magicHex: '0x184D2A5F',
      skippableFrameId: 15,
    });
  });
});
