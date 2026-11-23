import { describe, expect, it } from 'vitest';
import { parseLuksHeader } from './luks.utils.js';

function header(version, size = version === 1 ? 592 : 4096) {
  const buffer = new ArrayBuffer(size);
  const bytes = new Uint8Array(buffer);
  bytes.set([0x4c, 0x55, 0x4b, 0x53, 0xba, 0xbe]);
  new DataView(buffer).setUint16(6, version);
  return buffer;
}

function writeText(buffer, offset, text) {
  new Uint8Array(buffer).set(new TextEncoder().encode(text), offset);
}

describe('LUKS header parser', () => {
  it('parses LUKS1 metadata and all key slots', () => {
    const buffer = header(1);
    const view = new DataView(buffer);
    writeText(buffer, 8, 'aes');
    writeText(buffer, 40, 'xts-plain64');
    writeText(buffer, 72, 'sha256');
    writeText(buffer, 168, 'uuid-1');
    view.setUint32(104, 4096);
    view.setUint32(108, 64);
    view.setUint32(208 + 7 * 48, 0x00ac71f3);
    view.setUint32(212 + 7 * 48, 1234);
    view.setUint32(252 + 7 * 48, 4000);
    const result = parseLuksHeader(buffer);
    expect(result.fields).toEqual({
      'Cipher name': 'aes', 'Cipher mode': 'xts-plain64', 'Hash spec': 'sha256',
      'Payload offset (sectors)': 4096, 'Key bytes': 64, UUID: 'uuid-1',
    });
    expect(result.slots).toHaveLength(8);
    expect(result.slots[7]).toEqual({ active: 0x00ac71f3, iterations: 1234, stripes: 4000 });
  });

  it('parses LUKS2 binary fields and retains 64-bit precision', () => {
    const buffer = header(2);
    const view = new DataView(buffer);
    view.setBigUint64(8, 16384n);
    view.setBigUint64(16, 9007199254740993n);
    view.setBigUint64(256, 4096n);
    writeText(buffer, 24, 'label');
    writeText(buffer, 72, 'sha256');
    writeText(buffer, 168, 'uuid-2');
    writeText(buffer, 208, 'subsystem');
    view.setUint8(104, 0xab);
    view.setUint8(448, 0xcd);
    const { fields } = parseLuksHeader(buffer);
    expect(fields['Header size (bytes)']).toBe('16384');
    expect(fields['Sequence ID']).toBe('9007199254740993');
    expect(fields['Header offset (bytes)']).toBe('4096');
    expect(fields.Label).toBe('label');
    expect(fields['Checksum algorithm']).toBe('sha256');
    expect(fields.UUID).toBe('uuid-2');
    expect(fields.Subsystem).toBe('subsystem');
    expect(fields.Salt).toBe('ab' + '00'.repeat(63));
    expect(fields['Checksum (not verified)']).toBe('cd' + '00'.repeat(63));
  });

  it('rejects invalid magic, unknown versions, and truncated headers', () => {
    expect(() => parseLuksHeader(new ArrayBuffer(8))).toThrow('magic');
    expect(() => parseLuksHeader(header(3))).toThrow('Unsupported LUKS version');
    expect(() => parseLuksHeader(new ArrayBuffer(7))).toThrow('Truncated');
    expect(() => parseLuksHeader(header(1, 591))).toThrow('Truncated LUKS1');
    expect(() => parseLuksHeader(header(2, 4095))).toThrow('Truncated LUKS2');
  });
});
