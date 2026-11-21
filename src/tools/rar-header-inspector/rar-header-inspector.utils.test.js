import { describe, expect, it } from 'vitest';
import { inspectRarArchive, readVint } from './rar-header-inspector.utils.js';

const RAR4 = [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x00];
const RAR5 = [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x01, 0x00];

describe('readVint', () => {
  it('decodes one-byte and multi-byte values', () => {
    expect(readVint(new Uint8Array([0x7f]), 0)).toEqual({ value: 127, length: 1 });
    expect(readVint(new Uint8Array([0x81, 0x01]), 0)).toEqual({ value: 129, length: 2 });
  });

  it('rejects a truncated vint', () => {
    expect(() => readVint(new Uint8Array([0x80]), 0)).toThrow(/Truncated/);
  });
});

describe('inspectRarArchive', () => {
  it('detects RAR4 and parses a legacy main header', () => {
    const archive = new Uint8Array([...RAR4, 0x34, 0x12, 0x73, 0, 0, 7, 0]);
    const result = inspectRarArchive(archive);
    expect(result.format).toBe('RAR 4.x');
    expect(result.blocks[0].type).toBe('Main Archive');
    expect(result.blocks[0].fields).toContainEqual({ name: 'HEAD_SIZE', value: '7' });
  });

  it('detects RAR5 and parses a main archive header', () => {
    const archive = new Uint8Array([...RAR5, 0, 0, 0, 0, 3, 1, 0, 0]);
    const result = inspectRarArchive(archive);
    expect(result.format).toBe('RAR 5.0');
    expect(result.blocks[0].type).toBe('Main Archive');
    expect(result.blocks[0].fields).toContainEqual({ name: 'Archive flags', value: '0x0' });
  });

  it('recognizes RAR5 file, service, and end archive block fields', () => {
    const block = (type, flags) => [0, 0, 0, 0, 3, type, 0, flags];
    const archive = new Uint8Array([...RAR5, ...block(2, 1), ...block(3, 2), ...block(4, 4)]);
    const result = inspectRarArchive(archive);
    expect(result.blocks.map((item) => item.type)).toEqual(['File', 'Service', 'End of Archive']);
    expect(result.blocks[0].fields).toContainEqual({ name: 'File flags', value: '0x1' });
    expect(result.blocks[2].fields).toContainEqual({ name: 'End archive flags', value: '0x4' });
  });

  it('parses a RAR4 file block and skips its packed payload', () => {
    const archive = new Uint8Array([
      ...RAR4, 0, 0, 0x74, 0, 0, 15, 0, 2, 0, 0, 0, 9, 0, 0, 0, 0xaa, 0xbb,
    ]);
    const result = inspectRarArchive(archive);
    expect(result.blocks[0].type).toBe('File');
    expect(result.blocks[0].fields).toContainEqual({ name: 'PACK_SIZE', value: '2' });
    expect(result.errors).toEqual([]);
  });

  it('returns errors for malformed or truncated input without throwing', () => {
    expect(inspectRarArchive(new Uint8Array(RAR5)).errors).toEqual([]);
    const truncated = inspectRarArchive(new Uint8Array([...RAR5, 0, 0]));
    expect(truncated.errors[0]).toMatch(/Offset 8/);
    expect(inspectRarArchive(new Uint8Array([1, 2, 3])).errors[0]).toMatch(/signature/);
  });

  it('labels unsupported block types instead of crashing', () => {
    const archive = new Uint8Array([...RAR5, 0, 0, 0, 0, 3, 99, 0, 0]);
    expect(inspectRarArchive(archive).blocks[0].type).toMatch(/Unknown RAR5 block/);
  });
});
