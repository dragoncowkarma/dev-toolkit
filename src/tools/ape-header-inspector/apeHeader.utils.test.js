import { describe, expect, it } from 'vitest';
import { parseApeHeader } from './apeHeader.utils.js';

function modernApeFile() {
  const bytes = new Uint8Array(80);
  const view = new DataView(bytes.buffer);
  bytes.set([0x4d, 0x41, 0x43, 0x20]);
  view.setUint16(4, 3990, true);
  view.setUint32(8, 52, true);
  view.setUint32(12, 24, true);
  view.setUint32(16, 2, true);
  view.setUint32(20, 1, true);
  view.setUint32(24, 1, true);
  view.setUint32(28, 0, true);
  view.setUint32(32, 0, true);
  view.setUint16(52, 2000, true);
  view.setUint16(54, 0x20, true);
  view.setUint32(56, 73728, true);
  view.setUint32(60, 1000, true);
  view.setUint32(64, 12, true);
  view.setUint16(68, 16, true);
  view.setUint16(70, 2, true);
  view.setUint32(72, 44100, true);
  return bytes.buffer;
}

function legacyApeFile() {
  const bytes = new Uint8Array(36);
  const view = new DataView(bytes.buffer);
  bytes.set([0x4d, 0x41, 0x43, 0x20]);
  view.setUint16(4, 3970, true);
  view.setUint16(6, 1000, true);
  view.setUint16(8, 1, true);
  view.setUint16(10, 1, true);
  view.setUint32(12, 22050, true);
  view.setUint32(16, 4, true);
  view.setUint32(20, 0, true);
  view.setUint32(24, 3, true);
  view.setUint32(28, 512, true);
  return bytes.buffer;
}

function fieldValue(result, label) {
  return result.fields.find((field) => field.label === label)?.value;
}

describe('parseApeHeader', () => {
  it('parses a valid modern descriptor and header', () => {
    const result = parseApeHeader(modernApeFile());

    expect(result.layout).toContain('Modern');
    expect(result.version).toBe(3990);
    expect(fieldValue(result, 'Compression level')).toBe('2000');
    expect(fieldValue(result, 'Total frames')).toBe('12');
    expect(fieldValue(result, 'Sample rate')).toBe('44100 Hz');
    expect(fieldValue(result, 'APE frame data length')).toBe('1 bytes');
  });

  it('parses a valid legacy embedded header', () => {
    const result = parseApeHeader(legacyApeFile());

    expect(result.layout).toContain('Legacy');
    expect(result.version).toBe(3970);
    expect(fieldValue(result, 'Channels')).toBe('1');
    expect(fieldValue(result, 'WAV header length')).toBe('4 bytes');
  });

  it('rejects a truncated modern header and an overflowing declared section', () => {
    expect(() => parseApeHeader(new Uint8Array([0x4d, 0x41, 0x43, 0x20, 0x96, 0x0f]).buffer))
      .toThrow(/modern descriptor requires 52 bytes/);

    const truncated = modernApeFile();
    new DataView(truncated).setUint32(16, 200, true);
    expect(() => parseApeHeader(truncated)).toThrow(/seek table extends past the end/);
  });

  it('rejects invalid magic bytes', () => {
    expect(() => parseApeHeader(new Uint8Array(32).buffer)).toThrow(
      /expected the "MAC " signature/
    );
  });
});
