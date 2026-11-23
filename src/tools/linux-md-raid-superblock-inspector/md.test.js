import { describe, expect, it, vi } from 'vitest';
import { inspectFile, parseHex, parseSuperblock } from './md.utils.js';

function fixture() {
  const bytes = new Uint8Array(4096);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0xa92b4efc, true);
  view.setUint32(4, 1, true);
  view.setUint32(72, 5, true);
  view.setUint32(220, 1, true);
  view.setUint16(256, 0xffff, true);
  view.setUint32(216, 0xa92c4f02, true);
  return bytes;
}

function imageAt(offset, size) {
  const bytes = new Uint8Array(size);
  bytes.set(fixture(), offset);
  return {
    size,
    slice: vi.fn((start, end) => ({ arrayBuffer: async () => bytes.slice(start, end).buffer })),
  };
}

describe('md superblocks', () => {
  it('reads a valid 1.2 image using bounded slices', async () => {
    const image = imageAt(4096, 32768);
    const result = await inspectFile(image);
    expect(result.offset).toBe(4096);
    expect(result.fields.Level).toBe('raid5');
    expect(result.fields.Checksum).toBe('valid');
    expect(result.fields['Device roles']).toBe('0: spare');
    expect(image.slice).toHaveBeenCalledWith(4096, 8192);
  });

  it('reads a valid 1.0 image at the aligned end position', async () => {
    const image = imageAt(24576, 32768);
    expect((await inspectFile(image)).offset).toBe(24576);
  });

  it('reports unknown, incomplete and unsupported input', () => {
    expect(parseSuperblock(new Uint8Array(4)).error).toMatch(/bad magic/);
    expect(parseSuperblock(fixture().slice(0, 100)).error).toMatch(/Incomplete/);
    const bytes = fixture();
    new DataView(bytes.buffer).setUint32(4, 2, true);
    expect(parseSuperblock(bytes).error).toMatch(/Unsupported/);
    expect(() => parseHex('0xz')).toThrow();
  });

  it('diagnoses checksum mismatches without discarding fields', () => {
    const bytes = fixture();
    bytes[32] = 65;
    const result = parseSuperblock(bytes);
    expect(result.fields['Set name']).toBe('A');
    expect(result.diagnostic).toMatch(/checksum mismatch/);
  });

  it('rejects role tables beyond the superblock or available input', () => {
    const bytes = fixture();
    new DataView(bytes.buffer).setUint32(220, 1921, true);
    expect(parseSuperblock(bytes).error).toMatch(/role table/);
    new DataView(bytes.buffer).setUint32(220, 2, true);
    expect(parseSuperblock(bytes.slice(0, 258)).error).toMatch(/Incomplete/);
  });
});
