import { describe, expect, it } from 'vitest';
import { parseXzHeaders } from './xz-header-inspector.utils.js';

function vli(value) {
  const output = [];
  let remaining = BigInt(value);
  do {
    const byte = Number(remaining & 0x7fn);
    remaining >>= 7n;
    output.push(byte | (remaining ? 0x80 : 0));
  } while (remaining);
  return output;
}

function block(payloadLength, uncompressedSize) {
  const header = [1, 0, 0x21, 0, 0, 0, 0, 0];
  const unpaddedSize = header.length + payloadLength;
  const padding = new Array((4 - (unpaddedSize % 4)) % 4).fill(0);
  return {
    bytes: [...header, ...new Array(payloadLength).fill(0xaa), ...padding],
    unpaddedSize,
    uncompressedSize,
  };
}

function stream(blocks, checkId = 1) {
  const header = [0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00, 0, checkId, 0, 0, 0, 0];
  const records = blocks.flatMap((item) => [
    ...vli(item.unpaddedSize),
    ...vli(item.uncompressedSize),
  ]);
  const indexBody = [0, ...vli(blocks.length), ...records];
  const indexPadding = new Array((4 - ((indexBody.length + 4) % 4)) % 4).fill(0);
  const index = [...indexBody, ...indexPadding, 0, 0, 0, 0];
  const backwardSize = index.length / 4 - 1;
  return new Uint8Array([
    ...header, ...blocks.flatMap((item) => item.bytes), ...index,
    0, 0, 0, 0, backwardSize, 0, 0, 0, 0, checkId, 0x59, 0x5a,
  ]);
}

describe('parseXzHeaders', () => {
  it('parses a valid single-block stream', () => {
    const result = parseXzHeaders(stream([block(2, 20)]));
    expect(result.blocks).toHaveLength(1);
    expect(result.blocks[0].payloadSize).toBe(2n);
    expect(result.blocks[0].filters[0].id).toBe(33n);
    expect(result.index.records[0].uncompressedSize).toBe(20n);
  });

  it('parses a multi-block stream', () => {
    const result = parseXzHeaders(stream([block(1, 12), block(3, 100)]));
    expect(result.blocks).toHaveLength(2);
    expect(result.blocks[1].payloadSize).toBe(3n);
    expect(result.index.recordCount).toBe(2n);
  });

  it('reports a truncated header clearly', () => {
    expect(() => parseXzHeaders(new Uint8Array([0xfd, 0x37]))).toThrow(
      /shorter than|required header/i
    );
  });

  it('rejects bad magic bytes', () => {
    const input = stream([block(1, 1)]); input[0] = 0;
    expect(() => parseXzHeaders(input)).toThrow(/bad Stream Header magic/i);
  });

  it('parses CRC64 Check ID metadata without trying to verify it', () => {
    const result = parseXzHeaders(stream([block(1, 1)], 4));
    expect(result.streamHeader.checkName).toBe('CRC64');
    expect(result.streamFooter.checkId).toBe(4);
  });
});
