import { describe, expect, it } from 'vitest';
import { decodeInput, inspectLzip } from './lzip.utils.js';

const header = [0x4c, 0x5a, 0x49, 0x50, 1, 12];

describe('lzip inspector', () => {
  it('decodes hex and Base64 and rejects invalid input', () => {
    expect([...decodeInput('4c 5a 49 50 01 0c', 'hex').bytes]).toEqual(header);
    expect([...decodeInput('TFpJUAE M'.replace(' ', ''), 'base64').bytes]).toEqual(header);
    expect(decodeInput('abc', 'hex').error).toBeTruthy();
    expect(decodeInput('!!!!', 'base64').error).toBeTruthy();
  });
  it('validates header and dictionary boundaries', () => {
    expect(inspectLzip(Uint8Array.from(header)).dictionarySize).toBe(4096);
    expect(inspectLzip(Uint8Array.from([...header.slice(0, 5), 29])).dictionarySize)
      .toBe(512 * 1024 * 1024);
    expect(inspectLzip(Uint8Array.from([...header.slice(0, 5), 0x2c])).errors)
      .toContain('Invalid dictionary size code.');
    expect(inspectLzip(new Uint8Array(5)).errors[0]).toMatch(/Truncated/);
    expect(inspectLzip(Uint8Array.from([0, 0, 0, 0, 2, 31])).errors).toHaveLength(3);
  });
  it('reads little endian trailer and compares full-width sizes', () => {
    const bytes = new Uint8Array(30);
    bytes.set(header);
    const view = new DataView(bytes.buffer, 10);
    view.setUint32(0, 0x12345678, true);
    view.setBigUint64(4, 9007199254740993n, true);
    view.setBigUint64(12, 30n, true);
    const result = inspectLzip(bytes);
    expect(result.errors).toEqual([]);
    expect(result.trailer).toEqual({ crc32: 0x12345678, dataSize: 9007199254740993n,
      memberSize: 30n });
    view.setBigUint64(12, 31n, true);
    expect(inspectLzip(bytes).errors).toContain('Member size does not match input length.');
    expect(inspectLzip(bytes.slice(0, 12)).errors[0]).toMatch(/Truncated/);
    bytes[4] = 0;
    expect(inspectLzip(bytes).trailer).toBeUndefined();
  });
});
