import { describe, expect, it } from 'vitest';
import { parseZstdFrames } from './zstd-header.utils.js';

const MAGIC = [0x28, 0xb5, 0x2f, 0xfd];
const LAST_EMPTY_BLOCK = [0x01, 0x00, 0x00];

function standardFrame(descriptor, fields = []) {
  return new Uint8Array([...MAGIC, descriptor, ...fields, ...LAST_EMPTY_BLOCK]);
}

describe('parseZstdFrames', () => {
  it('parses a minimal standard frame with an unknown content size', () => {
    const [frame] = parseZstdFrames(standardFrame(0x00, [0x00]));
    expect(frame).toMatchObject({
      type: 'Standard Zstandard frame',
      frameContentSize: 'unknown',
      singleSegment: 'not set',
      windowSize: '1 KiB (1024 B)',
    });
  });

  it('parses both single-segment and window-descriptor forms', () => {
    const single = parseZstdFrames(standardFrame(0x20, [0x07]))[0];
    const windowed = parseZstdFrames(standardFrame(0x00, [0x0d]))[0];
    expect(single).toMatchObject({ singleSegment: 'set', frameContentSize: '7 B' });
    expect(windowed.windowSize).toBe('3 KiB (3328 B)');
  });

  it('parses absent and present dictionary IDs', () => {
    const absent = parseZstdFrames(standardFrame(0x20, [0x01]))[0];
    const present = parseZstdFrames(standardFrame(0x23, [0x78, 0x56, 0x34, 0x12, 0x01]))[0];
    expect(absent.dictionaryId).toBe('absent');
    expect(present.dictionaryId).toBe('305419896');
  });

  it('reports a content checksum flag and skips its checksum', () => {
    const bytes = new Uint8Array([...standardFrame(0x24, [0x00]), 1, 2, 3, 4]);
    const frame = parseZstdFrames(bytes)[0];
    expect(frame.contentChecksum).toBe('present');
  });

  it('parses skippable frames without interpreting their payload', () => {
    const bytes = new Uint8Array([0x50, 0x2a, 0x4d, 0x18, 2, 0, 0, 0, 0xff, 0xee]);
    const [frame] = parseZstdFrames(bytes);
    expect(frame).toMatchObject({ type: 'Skippable frame', frameSize: '2 B' });
  });

  it('parses concatenated standard and skippable frames', () => {
    const frames = parseZstdFrames(new Uint8Array([
      ...standardFrame(0x20, [0x01]),
      0x5f, 0x2a, 0x4d, 0x18, 1, 0, 0, 0, 0xaa,
      ...standardFrame(0x20, [0x02]),
    ]));
    expect(frames).toHaveLength(3);
    expect(frames.map((frame) => frame.type)).toEqual([
      'Standard Zstandard frame',
      'Skippable frame',
      'Standard Zstandard frame',
    ]);
  });

  it.each([
    [new Uint8Array([0x28, 0xb5]), /truncated frame magic number/],
    [new Uint8Array(MAGIC), /Frame_Header_Descriptor/],
    [new Uint8Array([...MAGIC, 0x00]), /Window_Descriptor/],
    [new Uint8Array([...MAGIC, 0x21]), /Dictionary_ID/],
    [new Uint8Array([...MAGIC, 0x20]), /Frame_Content_Size/],
    [new Uint8Array([...MAGIC, 0x20, 0x01]), /block header/],
    [new Uint8Array([...MAGIC, 0x20, 0x01, 0x09, 0x00, 0x00]), /block payload/],
    [new Uint8Array([...MAGIC, 0x24, 0x01, ...LAST_EMPTY_BLOCK]), /content checksum/],
    [new Uint8Array([0x50, 0x2a, 0x4d, 0x18]), /skippable Frame_Size/],
    [new Uint8Array([0x50, 0x2a, 0x4d, 0x18, 1, 0, 0, 0]), /skippable frame payload/],
  ])('rejects truncated input: %j', (input, expected) => {
    expect(() => parseZstdFrames(input)).toThrow(expected);
  });

  it('rejects invalid magic and malformed reserved bits', () => {
    expect(() => parseZstdFrames(new Uint8Array([0, 0, 0, 0])))
      .toThrow(/unsupported Zstandard magic/);
    expect(() => parseZstdFrames(standardFrame(0x28, [0]))).toThrow(/reserved bit is set/);
  });
});
