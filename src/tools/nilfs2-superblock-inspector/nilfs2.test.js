import { describe, expect, it } from 'vitest';
import { createSampleImage, inspectImage, parseSuperblock, superblockCrc } from './nilfs2.utils.js';

async function sampleBytes() {
  const buffer = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsArrayBuffer(createSampleImage());
  });
  return new Uint8Array(buffer);
}

describe('NILFS2 superblocks', () => {
  it('uses the Linux CRC32 convention without initial or final XOR', () => {
    expect(superblockCrc(new TextEncoder().encode('123456789'), 9, 0)).toBe(0x2dfd2d88);
  });

  it('reads primary and secondary blocks and preserves 64-bit device sizes', async () => {
    const bytes = await sampleBytes();
    const result = await inspectImage(new Blob([bytes]));
    expect(result.primary.status).toBe('valid');
    expect(result.secondary.status).toBe('valid');
    expect(result.secondary.offset).toBe(4096n);
    expect(result.primary.fields).toMatchObject({ revision: '2.0', inodeSize: 128,
      blockSizeShift: 2, blocksPerSegment: 512, reservedPercentage: 5,
      deviceSize: 8192n, volumeName: 'NILFS2 sample' });
    const sb = bytes.subarray(1024, 2048);
    new DataView(sb.buffer, sb.byteOffset).setBigUint64(32, 9007199254740993n, true);
    expect(parseSuperblock(sb).fields.deviceSize).toBe(9007199254740993n);
    const truncated = await inspectImage(new Blob([bytes]));
    expect(truncated.secondary.status).toBe('unknown');
  });

  it('distinguishes truncated, corrupt, and non-NILFS2 input', async () => {
    const bytes = await sampleBytes();
    expect((await inspectImage(new Blob([bytes.slice(0, 1028)]))).primary.status).toBe('unknown');
    expect((await inspectImage(new Blob([bytes.slice(0, 1040)]))).primary.status)
      .toBe('incomplete');
    expect((await inspectImage(new Blob([bytes.slice(0, 1300)]))).primary.status)
      .toBe('incomplete');
    expect((await inspectImage(new Blob([bytes.slice(0, 1400)]))).primary.status)
      .toBe('incomplete');
    bytes[1024 + 48] ^= 1;
    expect((await inspectImage(new Blob([bytes]))).primary.status).toBe('warning');
    bytes[1024 + 6] = 0;
    expect((await inspectImage(new Blob([bytes]))).primary.status).toBe('invalid');
  });

  it('reads only the two superblock ranges', async () => {
    const file = createSampleImage();
    const calls = [];
    const wrapper = { size: file.size, slice: (start, end) => {
      calls.push([start, end]);
      return file.slice(start, end);
    } };
    await inspectImage(wrapper);
    expect(calls).toEqual([[1024, 2048], [4096, 5120]]);
  });
});
