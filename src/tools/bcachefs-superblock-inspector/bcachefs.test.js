import { describe, expect, it } from 'vitest';
import { inspectFile, parseSuperblock, sampleSuperblock } from './bcachefs.utils.js';

describe('bcachefs superblock', () => {
  it('parses the sample and checks the checksum', () => {
    const result = parseSuperblock(sampleSuperblock());
    expect(result.checksumStatus).toBe('Match');
    expect(result.members).toEqual([8388608n]);
    expect(result.fields).toEqual([{ type: 1, size: 64 }]);
  });

  it('rejects truncated input and wrong magic', () => {
    expect(() => parseSuperblock(new ArrayBuffer(100))).toThrow(/truncated/i);
    const bytes = new Uint8Array(sampleSuperblock());
    bytes[24] = 0;
    expect(() => parseSuperblock(bytes.buffer)).toThrow(/magic/i);
    expect(() => parseSuperblock(sampleSuperblock().slice(0, 760))).toThrow(/truncated/i);
  });

  it('reports a mismatch and retains 64-bit sector counts', () => {
    const bytes = sampleSuperblock();
    const view = new DataView(bytes);
    view.setBigUint64(776, 9007199254740993n, true);
    view.setUint16(786, 1, true);
    const result = parseSuperblock(bytes);
    expect(result.members[0]).toBe(9007199254740993n);
    expect(result.checksumStatus).toBe('Mismatch');
  });

  it('verifies a crc64 fixture and detects corruption', () => {
    const bytes = sampleSuperblock();
    const view = new DataView(bytes);
    view.setBigUint64(144, 6n << 2n, true);
    view.setBigUint64(0, 0xe3b6140504255468n, true);
    expect(parseSuperblock(bytes).checksumStatus).toBe('Match');
    view.setUint8(72, 0);
    expect(parseSuperblock(bytes).checksumStatus).toBe('Mismatch');
  });

  it('does not mark unsupported checksums as passing', () => {
    const bytes = sampleSuperblock();
    new DataView(bytes).setBigUint64(144, 7n << 2n, true);
    expect(parseSuperblock(bytes).checksumStatus).toBe('Unverified');
  });

  it('reads only slices of the primary superblock', async () => {
    const image = new Uint8Array(4096 + sampleSuperblock().byteLength);
    image.set(new Uint8Array(sampleSuperblock()), 4096);
    const file = new File([image], 'disk.img');
    const original = file.slice.bind(file);
    const ranges = [];
    file.slice = (start, end) => { ranges.push([start, end]); return original(start, end); };
    expect((await inspectFile(file)).checksumStatus).toBe('Match');
    expect(ranges).toEqual([[4096, 4848], [4096, image.length]]);
  });
});
