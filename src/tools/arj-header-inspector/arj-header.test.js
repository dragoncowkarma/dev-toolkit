import { describe, expect, it } from 'vitest';
import { parseArjHeaders } from './arj-header.utils.js';

// Independently generated with Python's zlib.crc32; includes one extended header.
const archiveHex =
  '60ea25001e0b0a020002020000002150000021500000000000000000000000000000612e' +
  '61726a0000c9694eae03000102031d80bc55000060ea27001e0b0a020003000000002150' +
  '030000000500000078563412000000000000662e74787400686900ec61365f0000';

function archive() {
  return Uint8Array.from(archiveHex.match(/../g), (pair) => parseInt(pair, 16));
}

describe('parseArjHeaders', () => {
  it('reads main and first local headers and skips extended headers', () => {
    const result = parseArjHeaders(archive().buffer);
    expect(result.mainHeader).toMatchObject({
      magic: '60 EA', filename: 'a.arj', fileType: 2, created: '2020-01-01 00:00:00',
    });
    expect(result.fileHeader).toMatchObject({
      filename: 'f.txt', comment: 'hi', method: 3, compressedSize: 3,
      originalSize: 5, originalCrc: 0x12345678,
    });
  });

  it('rejects bad magic distinctly', () => {
    const bytes = archive();
    bytes[0] = 0;
    expect(() => parseArjHeaders(bytes.buffer)).toThrow(/magic/i);
  });

  it('rejects truncated input distinctly', () => {
    expect(() => parseArjHeaders(new Uint8Array([0x60]).buffer)).toThrow(/truncated/i);
  });

  it('rejects a header size exceeding the remaining buffer distinctly', () => {
    const bytes = archive();
    bytes[2] = 255;
    expect(() => parseArjHeaders(bytes.buffer)).toThrow(/size exceeds/i);
  });

  it('rejects a CRC mismatch distinctly', () => {
    const bytes = archive();
    bytes[5] ^= 1;
    expect(() => parseArjHeaders(bytes.buffer)).toThrow(/CRC-32 mismatch/i);
  });
});
