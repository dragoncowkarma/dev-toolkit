import { describe, expect, it, vi } from 'vitest';
import {
  formatFileSize,
  inspectCompressZHeader,
  MAX_INPUT_BYTES,
  parseBase64String,
  parseHexString,
  readFileHeaderBytes,
  toHexByte,
} from './compress-z-header-inspector.utils.js';

describe('inspectCompressZHeader', () => {
  it('inspects a valid header with 16 bits and block mode enabled', () => {
    // 0x90 = 0x80 (block) | 16
    const bytes = new Uint8Array([0x1f, 0x9d, 0x90]);
    const result = inspectCompressZHeader(bytes);

    expect(result.magic).toBe('1F 9D');
    expect(result.maxBits).toBe(16);
    expect(result.maxCodes).toBe(65536);
    expect(result.blockMode).toBe(true);
    expect(result.reservedBits).toBe(0);
    expect(result.byte3Hex).toBe('0x90');
    expect(result.totalBytes).toBe(3);
    expect(result.payloadBytes).toBe(0);
  });

  it('inspects a valid header with 16 bits and block mode disabled', () => {
    // 0x10 = 0x00 (non-block) | 16
    const bytes = new Uint8Array([0x1f, 0x9d, 0x10]);
    const result = inspectCompressZHeader(bytes);

    expect(result.maxBits).toBe(16);
    expect(result.maxCodes).toBe(65536);
    expect(result.blockMode).toBe(false);
    expect(result.reservedBits).toBe(0);
  });

  it('inspects a valid header with 12 bits and block mode enabled', () => {
    // 0x8C = 0x80 (block) | 12 (0x0C)
    const bytes = new Uint8Array([0x1f, 0x9d, 0x8c]);
    const result = inspectCompressZHeader(bytes);

    expect(result.maxBits).toBe(12);
    expect(result.maxCodes).toBe(4096);
    expect(result.blockMode).toBe(true);
    expect(result.reservedBits).toBe(0);
  });

  it('inspects a valid header with 12 bits and block mode disabled', () => {
    // 0x0C = 0x00 (non-block) | 12 (0x0C)
    const bytes = new Uint8Array([0x1f, 0x9d, 0x0c]);
    const result = inspectCompressZHeader(bytes);

    expect(result.maxBits).toBe(12);
    expect(result.maxCodes).toBe(4096);
    expect(result.blockMode).toBe(false);
    expect(result.reservedBits).toBe(0);
  });

  it('inspects boundary 9 bits with block mode enabled and disabled', () => {
    const onResult = inspectCompressZHeader(new Uint8Array([0x1f, 0x9d, 0x89]));
    expect(onResult.maxBits).toBe(9);
    expect(onResult.maxCodes).toBe(512);
    expect(onResult.blockMode).toBe(true);

    const offResult = inspectCompressZHeader(new Uint8Array([0x1f, 0x9d, 0x09]));
    expect(offResult.maxBits).toBe(9);
    expect(offResult.maxCodes).toBe(512);
    expect(offResult.blockMode).toBe(false);
  });

  it('inspects header with extra compressed payload without decompressing', () => {
    const bytes = new Uint8Array([0x1f, 0x9d, 0x90, 0x01, 0x02, 0x03, 0x04]);
    const result = inspectCompressZHeader(bytes);

    expect(result.totalBytes).toBe(7);
    expect(result.payloadBytes).toBe(4);
  });

  it('throws for bad magic bytes', () => {
    // Gzip magic (1F 8B)
    expect(() => inspectCompressZHeader(new Uint8Array([0x1f, 0x8b, 0x90]))).toThrow(
      /Invalid magic bytes/
    );
    // Bad first byte
    expect(() => inspectCompressZHeader(new Uint8Array([0x00, 0x9d, 0x90]))).toThrow(
      /Invalid magic bytes/
    );
  });

  it('throws for truncated input with fewer than 3 bytes', () => {
    expect(() => inspectCompressZHeader(new Uint8Array([]))).toThrow(/Truncated input/);
    expect(() => inspectCompressZHeader(new Uint8Array([0x1f]))).toThrow(/Truncated input/);
    expect(() => inspectCompressZHeader(new Uint8Array([0x1f, 0x9d]))).toThrow(
      /Truncated input/
    );
    expect(() => inspectCompressZHeader(null)).toThrow(/Truncated input/);
  });

  it('throws when reserved bits (5 or 6) are set', () => {
    // Bit 5 set: 0x20
    expect(() => inspectCompressZHeader(new Uint8Array([0x1f, 0x9d, 0x80 | 0x20 | 16]))).toThrow(
      /reserved bits must be zero/
    );
    // Bit 6 set: 0x40
    expect(() => inspectCompressZHeader(new Uint8Array([0x1f, 0x9d, 0x80 | 0x40 | 16]))).toThrow(
      /reserved bits must be zero/
    );
    // Bits 5 and 6 set: 0x60
    expect(() => inspectCompressZHeader(new Uint8Array([0x1f, 0x9d, 0x60 | 16]))).toThrow(
      /reserved bits must be zero/
    );
  });

  it('throws when max code bits are outside the 9-16 range', () => {
    // 8 bits (< 9)
    expect(() => inspectCompressZHeader(new Uint8Array([0x1f, 0x9d, 0x80 | 8]))).toThrow(
      /Invalid maximum code bits/
    );
    // 0 bits (< 9)
    expect(() => inspectCompressZHeader(new Uint8Array([0x1f, 0x9d, 0x80 | 0]))).toThrow(
      /Invalid maximum code bits/
    );
    // 17 bits (> 16)
    expect(() => inspectCompressZHeader(new Uint8Array([0x1f, 0x9d, 0x80 | 17]))).toThrow(
      /Invalid maximum code bits/
    );
    // 31 bits (> 16)
    expect(() => inspectCompressZHeader(new Uint8Array([0x1f, 0x9d, 0x80 | 31]))).toThrow(
      /Invalid maximum code bits/
    );
  });

  it('throws when input exceeds maximum size limit', () => {
    const huge = new Uint8Array(MAX_INPUT_BYTES + 1);
    huge[0] = 0x1f;
    huge[1] = 0x9d;
    huge[2] = 0x90;
    expect(() => inspectCompressZHeader(huge)).toThrow(/maximum size limit/);
  });

  it('supports custom totalBytes option when inspecting a bounded stream slice', () => {
    const slice = new Uint8Array([0x1f, 0x9d, 0x90, 0xaa, 0xbb]);
    const result = inspectCompressZHeader(slice, { totalBytes: 100 * 1024 });

    expect(result.totalBytes).toBe(102400);
    expect(result.payloadBytes).toBe(102400 - 3);
  });
});

describe('parseHexString', () => {
  it('parses valid hex with spaces, prefixes, and colons', () => {
    const bytes1 = parseHexString('1F 9D 90');
    expect(Array.from(bytes1)).toEqual([0x1f, 0x9d, 0x90]);

    const bytes2 = parseHexString('0x1f, 0x9d, 0x90');
    expect(Array.from(bytes2)).toEqual([0x1f, 0x9d, 0x90]);

    const bytes3 = parseHexString('1f:9d:90');
    expect(Array.from(bytes3)).toEqual([0x1f, 0x9d, 0x90]);

    const bytes4 = parseHexString('1f9d90');
    expect(Array.from(bytes4)).toEqual([0x1f, 0x9d, 0x90]);
  });

  it('returns empty array for empty or whitespace-only input', () => {
    expect(parseHexString('').length).toBe(0);
    expect(parseHexString('   ').length).toBe(0);
  });

  it('throws TypeError for non-string input', () => {
    expect(() => parseHexString(null)).toThrow(TypeError);
    expect(() => parseHexString(123)).toThrow(TypeError);
  });

  it('throws Error for odd number of hex digits', () => {
    expect(() => parseHexString('1F9')).toThrow(/odd number of digits/);
  });

  it('throws Error for non-hex characters', () => {
    expect(() => parseHexString('1F 9D ZZ')).toThrow(/non-hex characters/);
  });

  it('throws Error when hex input exceeds bounded size', () => {
    const longHex = '1f'.repeat(MAX_INPUT_BYTES + 1);
    expect(() => parseHexString(longHex)).toThrow(/maximum size limit/);
  });
});

describe('parseBase64String', () => {
  it('parses valid Base64 string', () => {
    // 0x1F, 0x9D, 0x90 -> Base64 is H52Q
    const bytes = parseBase64String('H52Q');
    expect(Array.from(bytes)).toEqual([0x1f, 0x9d, 0x90]);
  });

  it('returns empty array for empty or whitespace-only Base64', () => {
    expect(parseBase64String('').length).toBe(0);
    expect(parseBase64String('  \n  ').length).toBe(0);
  });

  it('throws TypeError for non-string input', () => {
    expect(() => parseBase64String(123)).toThrow(TypeError);
  });

  it('throws Error for invalid Base64 characters or padding', () => {
    expect(() => parseBase64String('invalid!base64')).toThrow(/Invalid Base64/);
    expect(() => parseBase64String('H52')).toThrow(/Invalid Base64/);
  });

  it('rejects oversized Base64 input without decoding it', () => {
    const atobSpy = vi.spyOn(globalThis, 'atob');
    // 87,384 chars decodes to 65,538 bytes (> MAX_INPUT_BYTES = 65,536)
    const oversizedBase64 = 'AAAA'.repeat(21846);

    expect(() => parseBase64String(oversizedBase64)).toThrow(
      `Input exceeds maximum size limit of ${MAX_INPUT_BYTES} bytes.`
    );
    expect(atobSpy).not.toHaveBeenCalled();
    atobSpy.mockRestore();
  });

  it('correctly accounts for padding when checking Base64 length limit', () => {
    const atobSpy = vi.spyOn(globalThis, 'atob');
    // (87384 / 4) * 3 - 2 = 65,536 bytes (exactly MAX_INPUT_BYTES)
    const exactMaxBase64 = `${'AAAA'.repeat(21845)}AA==`;
    const parsed = parseBase64String(exactMaxBase64);
    expect(parsed.length).toBe(MAX_INPUT_BYTES);
    expect(atobSpy).toHaveBeenCalled();
    atobSpy.mockRestore();
  });
});

describe('readFileHeaderBytes', () => {
  it('reads bytes from a file slice', async () => {
    const file = new File([new Uint8Array([0x1f, 0x9d, 0x90])], 'test.Z');
    const bytes = await readFileHeaderBytes(file);
    expect(Array.from(bytes)).toEqual([0x1f, 0x9d, 0x90]);
  });

  it('rejects when reader encounters an error', async () => {
    const failingReader = {
      readAsArrayBuffer: vi.fn(function readAsArrayBuffer() {
        this.onerror(new Error('fail'));
      }),
    };
    const OriginalFileReader = global.FileReader;
    global.FileReader = vi.fn(function FileReader() {
      return failingReader;
    });

    await expect(readFileHeaderBytes(new File([''], 'err.Z'))).rejects.toThrow(
      'Failed to read the selected file.'
    );

    global.FileReader = OriginalFileReader;
  });
});

describe('formatting helpers', () => {
  it('formats hex byte correctly', () => {
    expect(toHexByte(0x1f)).toBe('1F');
    expect(toHexByte(0x05)).toBe('05');
  });

  it('formats file sizes', () => {
    expect(formatFileSize(100)).toBe('100 B');
    expect(formatFileSize(2048)).toBe('2.0 KB');
  });
});
