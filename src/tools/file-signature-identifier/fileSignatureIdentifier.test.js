import { describe, expect, it, vi } from 'vitest';
import {
  identifyFileSignature,
  readFileHeader,
} from './fileSignatureIdentifier.utils.js';

function identify(bytes) {
  return identifyFileSignature(Uint8Array.from(bytes));
}

describe('identifyFileSignature', () => {
  it.each([
    ['PNG image', [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
    ['JPEG image', [0xff, 0xd8, 0xff, 0xe0]],
    ['GIF image', [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]],
    ['PDF document', [0x25, 0x50, 0x44, 0x46, 0x2d]],
    ['ZIP archive', [0x50, 0x4b, 0x03, 0x04]],
    ['GZIP archive', [0x1f, 0x8b, 0x08]],
    ['ELF executable', [0x7f, 0x45, 0x4c, 0x46]],
    [
      'SQLite database',
      [
        0x53, 0x51, 0x4c, 0x69, 0x74, 0x65, 0x20, 0x66,
        0x6f, 0x72, 0x6d, 0x61, 0x74, 0x20, 0x33, 0,
      ],
    ],
    ['FLAC audio', [0x66, 0x4c, 0x61, 0x43]],
    ['BMP image', [0x42, 0x4d]],
    ['Zstandard archive', [0x28, 0xb5, 0x2f, 0xfd]],
  ])('identifies %s', (name, bytes) => {
    expect(identify(bytes)).toMatchObject({ name, offset: 0 });
  });

  it('identifies MP4 through its ftyp signature at byte offset 4', () => {
    const result = identify([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]);
    expect(result).toMatchObject({ name: 'MP4 media', offset: 4, hex: '66 74 79 70' });
  });

  it('identifies WAV through its container type at byte offset 8', () => {
    const result = identify([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45]);
    expect(result).toMatchObject({ name: 'WAV audio', offset: 8 });
  });

  it('does not guess for empty or random bytes', () => {
    expect(identify([])).toBeNull();
    expect(identify([0xde, 0xad, 0xbe, 0xef])).toBeNull();
  });
});

describe('readFileHeader', () => {
  it('reads only the first 512 bytes of a large local file', async () => {
    const file = new File([new Uint8Array(1024).fill(0x5a)], 'large.bin');
    const headerBytes = new Uint8Array(512).fill(0x5a);
    const slice = vi.fn(() => ({ arrayBuffer: async () => headerBytes.buffer }));
    Object.defineProperty(file, 'slice', { value: slice });
    const header = await readFileHeader(file);
    expect(header).toHaveLength(512);
    expect(header[0]).toBe(0x5a);
    expect(slice).toHaveBeenCalledWith(0, 512);
  });
});
