import { describe, expect, it } from 'vitest';
import { inspectUdf } from './udf.utils.js';

const sector = 2048;
function image() {
  const bytes = new Uint8Array(261 * sector);
  const view = new DataView(bytes.buffer);
  const identifier = (block, id) => {
    for (let i = 0; i < id.length; i += 1) bytes[block * sector + 1 + i] = id.charCodeAt(i);
  };
  const descriptor = (block, id) => {
    const start = block * sector;
    view.setUint16(start, id, true);
    view.setUint16(start + 6, 7, true);
    view.setUint32(start + 12, block, true);
    bytes[start + 4] = bytes.subarray(start, start + 16).reduce((a, b) => a + b, 0) & 255;
  };
  identifier(16, 'BEA01'); identifier(17, 'NSR03'); identifier(18, 'TEA01');
  descriptor(256, 2);
  view.setUint32(256 * sector + 16, 3 * sector, true);
  view.setUint32(256 * sector + 20, 257, true);
  descriptor(257, 1);
  bytes[257 * sector + 24] = 8;
  bytes.set([84, 69, 83, 84], 257 * sector + 25);
  bytes[257 * sector + 55] = 5;
  view.setUint16(257 * sector + 378, 2026, true);
  bytes.set([11, 24, 12, 30, 45], 257 * sector + 380);
  descriptor(258, 6);
  const domain = '*OSTA UDF Compliant';
  for (let i = 0; i < domain.length; i += 1) bytes[258 * sector + 217 + i] = domain.charCodeAt(i);
  view.setUint16(258 * sector + 240, 0x0260, true);
  descriptor(259, 8);
  return bytes;
}
function file(bytes) {
  return { size: bytes.length, slice: (start, end) => ({
    arrayBuffer: async () => bytes.slice(start, end).buffer,
  }) };
}
describe('UDF inspector', () => {
  it('reads descriptors and reports actual file size', async () => {
    const bytes = image();
    const result = await inspectUdf(file(bytes));
    expect(result).toMatchObject({ fileSize: bytes.length, nsr: 'NSR03', revision: '2.60',
      anchor: { identifier: 2, serial: 7, location: 256 }, extentLocation: 257,
      primary: { volumeIdentifier: 'TEST', recordingDateTime: '2026-11-24 12:30:45.000000 +00:00' },
    });
  });
  it.each([16, 17])('rejects missing recognition descriptor at sector %i', async (block) => {
    const bytes = image(); bytes[block * sector + 1] = 0;
    await expect(inspectUdf(file(bytes))).rejects.toThrow(/recognition sequence/i);
  });
  it('rejects a bad anchor checksum', async () => {
    const bytes = image(); bytes[256 * sector + 4] ^= 1;
    await expect(inspectUdf(file(bytes))).rejects.toThrow(/checksum/i);
  });
  it('rejects truncated input', async () => {
    await expect(inspectUdf(file(image().slice(0, 256 * sector + 3))))
      .rejects.toThrow(/truncated/i);
  });
});
