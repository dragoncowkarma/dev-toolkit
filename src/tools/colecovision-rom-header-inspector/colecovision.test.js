import { describe, expect, it } from 'vitest';
import { parseColecoVision } from './colecovision.utils.js';

function rom(signature = [0xaa, 0x55]) {
  const bytes = new Uint8Array(8192);
  bytes.set(signature);
  bytes.set([0x34, 0x12], 2);
  bytes.set([0xc3, 0x78, 0x56], 12);
  bytes.set(new TextEncoder().encode('BOTTOM/TOP/1982'), 36);
  return bytes;
}

describe('ColecoVision header', () => {
  it('parses title, pointers and vector bytes', () => {
    const result = parseColecoVision(rom());
    expect(result.title).toEqual({ line1: 'TOP', line2: 'BOTTOM', year: '1982' });
    expect(result.pointers[0].value).toBe(0x1234);
    expect(result.vectors[0].bytes).toEqual([0xc3, 0x78, 0x56]);
    expect(result.vectors[7].label).toBe('NMI');
  });
  it('supports skip-title cartridges and size warnings', () => {
    const result = parseColecoVision(rom([0x55, 0xaa]), 32769);
    expect(result.title).toBeNull();
    expect(result.unaligned).toBe(true);
    expect(result.oversized).toBe(true);
  });
  it('rejects missing title data and truncated or empty files', () => {
    expect(() => parseColecoVision(rom().slice(0, 36))).toThrow(/title/i);
    expect(() => parseColecoVision(new Uint8Array(35))).toThrow(/short/i);
    expect(() => parseColecoVision(new Uint8Array())).toThrow(/short/i);
    expect(() => parseColecoVision(new Uint8Array(36))).toThrow(/signature/i);
  });
});
