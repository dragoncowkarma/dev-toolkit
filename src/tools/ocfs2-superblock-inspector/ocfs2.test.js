import { describe, expect, it, vi } from 'vitest';
import { inspectFile, inspectHex, inspectOcfs2 } from './ocfs2.utils.js';

function image(size = 2048) {
  const bytes = new Uint8Array(size * 2 + 352);
  const offset = size * 2;
  bytes.set(new TextEncoder().encode('OCFSV2'), offset);
  const view = new DataView(bytes.buffer, offset);
  view.setUint16(0xc0, 1, true);
  view.setUint16(0xc2, 90, true);
  view.setUint32(0xf8, Math.log2(size), true);
  view.setUint32(0xfc, 16, true);
  view.setUint16(0x100, 12, true);
  view.setBigUint64(0xe8, 9007199254740993n, true);
  view.setBigUint64(0xf0, 99n, true);
  bytes.set(new TextEncoder().encode('volume'), offset + 0x110);
  bytes.set(Uint8Array.from({ length: 16 }, (_, index) => index), offset + 0x150);
  return bytes;
}

function reader(bytes) {
  return (offset, length) => Promise.resolve(bytes.slice(offset, offset + length));
}

describe('OCFS2 inspection', () => {
  it.each([512, 1024, 2048, 4096])('decodes a block at size %i', async (size) => {
    const { data } = await inspectOcfs2(reader(image(size)));
    expect(data).toMatchObject({
      blockSize: size, major: 1, minor: 90, blockBits: Math.log2(size), clusterBits: 16,
      maxSlots: 12, root: 9007199254740993n, systemDir: 99n, label: 'volume',
      uuid: '00010203-0405-0607-0809-0a0b0c0d0e0f',
    });
  });

  it('reports missing fields in a truncated superblock as unknown', async () => {
    const bytes = image(512).slice(0, 1024 + 194);
    const { data } = await inspectOcfs2(reader(bytes));
    expect(data.major).toBe(1);
    expect(data.minor).toBeNull();
    expect(data.uuid).toBeNull();
    expect(data.root).toBeNull();
  });

  it('rejects bad signatures and malformed hex without throwing', async () => {
    expect((await inspectOcfs2(reader(new Uint8Array(10000)))).error).toMatch(/signature/);
    expect((await inspectHex('123z')).error).toMatch(/hexadecimal/);
    expect((await inspectHex('123')).error).toMatch(/complete bytes/);
    expect((await inspectOcfs2(() => { throw Error(); })).error).toMatch(/Unable/);
  });

  it('reports known and unknown feature bits', async () => {
    const bytes = image(512);
    const view = new DataView(bytes.buffer, 1024);
    view.setUint32(0xdc, 0x80000001, true);
    view.setUint32(0xe0, 0x10001, true);
    view.setUint32(0xe4, 0x80000004, true);
    const { data } = await inspectOcfs2(reader(bytes));
    expect(data.compat).toEqual({ value: 0x80000001, known: ['BACKUP_SB'], unknown: 0x80000000 });
    expect(data.incompat.unknown).toBe(0x10001);
    expect(data.roCompat.unknown).toBe(0x80000000);
  });

  it('limits file slices and decodes hex images', async () => {
    const bytes = image(1024);
    const file = { slice: vi.fn((start, end) => ({
      arrayBuffer: async () => bytes.slice(start, end).buffer,
    })) };
    expect((await inspectFile(file)).data.blockSize).toBe(1024);
    expect(file.slice.mock.calls).toEqual([[1024, 1376], [2048, 2400]]);
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(' ');
    expect((await inspectHex(hex)).data.uuid).toBe('00010203-0405-0607-0809-0a0b0c0d0e0f');
  });
});
