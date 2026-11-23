import { describe, expect, it } from 'vitest';
import { decodeBytes, parseMusepack } from './musepack.utils.js';

const magic = [77, 80, 67, 75];
const sh = [83, 72, 12, 0x12, 0xa5, 0xab, 0x62, 8, 42, 0, 0x3b, 0x1b];
const parse = (data) => parseMusepack(Uint8Array.from(data));

describe('Musepack SV8', () => {
  it('decodes an SH packet and packet sizes', () => {
    const result = parse([...magic, ...sh, 82, 71, 3, 83, 69, 3, 0xff]);
    expect(result.ok).toBe(true);
    expect(result.header).toEqual({ crc: '12a5ab62', version: 8, sampleCount: '42',
      beginningSilence: '0', sampleRateIndex: 1, sampleRate: 48000, maxUsedBands: 28,
      channels: 2, midSide: true, audioBlockFrames: 64 });
    expect(result.packets).toEqual([{ key: 'SH', size: 12 }, { key: 'RG', size: 3 },
      { key: 'SE', size: 3 }]);
  });
  it('walks a multibyte size and unknown packet', () => {
    const result = parse([...magic, ...sh, 90, 90, 0x81, 0x00, ...Array(124).fill(0)]);
    expect(result.ok).toBe(true);
    expect(result.packets[1]).toEqual({ key: 'ZZ', size: 128 });
  });
  it('rejects bad magic and truncated data', () => {
    expect(parse([0, 0, 0, 0]).error).toMatch(/magic/i);
    for (const data of [[77], [...magic, 83], [...magic, 83, 72, 0x80],
      [...magic, ...sh.slice(0, -1)], [...magic, 83, 72, 8, 0, 0, 0, 0, 8]]) {
      expect(parse(data).ok).toBe(false);
    }
  });
  it('rejects malformed lengths and preserves large variable integers', () => {
    expect(parse([...magic, 83, 72, 2]).ok).toBe(false);
    const large = [83, 72, 20, 0, 0, 0, 1, 8,
      ...Array(8).fill(0xff), 0x7f, 0, 0, 0];
    expect(parse([...magic, ...large]).header.sampleCount).toBe('9223372036854775807');
  });
  it('decodes pasted data and rejects malformed text', () => {
    expect([...decodeBytes('4d 50', 'hex')]).toEqual([77, 80]);
    expect([...decodeBytes('TVA=', 'base64')]).toEqual([77, 80]);
    expect(() => decodeBytes('xyz', 'hex')).toThrow();
    expect(() => decodeBytes('%%%%', 'base64')).toThrow();
  });
});
