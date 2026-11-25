import { describe, expect, it, vi } from 'vitest';
import { inspectRom } from './pc-engine.utils.js';

function rom(size, vectorOffset, low = 0, high = 0xe0) {
  const bytes = new Uint8Array(size);
  if (vectorOffset !== undefined) bytes.set([low, high], vectorOffset);
  return new Blob([bytes]);
}

describe('inspectRom', () => {
  it('reads only the reset vector of a raw image', async () => {
    const file = rom(16384, 16382, 0x34, 0xe2);
    const slice = vi.spyOn(file, 'slice');
    expect(await inspectRom(file)).toMatchObject({
      hasCopierHeader: false, romSize: 16384, bankCount: 2, aligned: true,
      resetVector: 0xe234, vectorInRange: true,
    });
    expect(slice).toHaveBeenCalledWith(16382, 16384);
  });

  it('accounts for a 512-byte copier header', async () => {
    expect(await inspectRom(rom(8704, 8702))).toMatchObject({
      hasCopierHeader: true, romSize: 8192, bankCount: 1, resetVector: 0xe000,
    });
  });

  it('uses the last complete bank in an irregular image', async () => {
    expect(await inspectRom(rom(8200, 8190, 0, 0x07))).toMatchObject({
      aligned: false, bankCount: 1, resetVector: 0x0700,
      vectorInRange: false, bitReversed: true,
    });
  });

  it('leaves an ambiguous bit-reversal heuristic unknown', async () => {
    expect((await inspectRom(rom(8192, 8190, 0, 0xff))).bitReversed).toBeNull();
    expect((await inspectRom(rom(8192, 8190, 0, 0x40))).bitReversed).toBeNull();
    expect((await inspectRom(rom(8192, 8190, 0, 0xe0))).bitReversed).toBe(false);
  });

  it.each([0, 1, 512])('handles a short %i-byte file', async (size) => {
    expect(await inspectRom(rom(size))).toMatchObject({
      bankCount: 0, resetVector: null, vectorInRange: null, bitReversed: null,
    });
  });
});
