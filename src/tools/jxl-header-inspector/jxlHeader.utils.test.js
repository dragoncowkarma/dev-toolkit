import { describe, expect, it } from 'vitest';
import { base64ToBytes, inspectJxl } from './jxlHeader.utils.js';

function bareDefault(width = 8, height = 8) {
  // Signature, small sizes, ratio 0 and the ImageMetadata all-default bit.
  const heightBits = Array.from({ length: 5 }, (_, index) => ((height / 8 - 1) >> index) & 1);
  const widthBits = Array.from({ length: 5 }, (_, index) => ((width / 8 - 1) >> index) & 1);
  const bits = [1, ...heightBits, 0, 0, 0, ...widthBits, 1];
  return Uint8Array.from([0xff, 0x0a, ...bits.reduce((bytes, bit, index) => {
    bytes[Math.floor(index / 8)] = (bytes[Math.floor(index / 8)] || 0) | (bit << (index % 8));
    return bytes;
  }, [])]);
}

function bareCustomFloatingMetadata() {
  // Small 8x8 size, all_default=0, extra_fields=0, 32-bit float, 8 exponent
  // bits, modular buffer false, and one extra channel.
  const bits = [
    1, // Small size.
    0, 0, 0, 0, 0, // Height: 8.
    0, 0, 0, // No aspect ratio.
    0, 0, 0, 0, 0, // Width: 8.
    0, // all_default.
    0, // extra_fields.
    1, // floating_point_sample.
    0, 0, // 32-bit float selector.
    1, 1, 1, 0, // exponent_bits_per_sample: 8.
    0, // modular_16_bit_buffer_sufficient.
    1, 0, // One extra channel.
  ];
  return Uint8Array.from([0xff, 0x0a, ...bits.reduce((bytes, bit, index) => {
    bytes[Math.floor(index / 8)] = (bytes[Math.floor(index / 8)] || 0) | (bit << (index % 8));
    return bytes;
  }, [])]);
}

describe('inspectJxl', () => {
  it('parses a bare default codestream using LSB-first header bits', () => {
    const result = inspectJxl(bareDefault(16, 24), 'Test input');
    expect(result.format).toBe('Bare codestream');
    expect(result.header).toMatchObject({ width: 16, height: 24, bitDepth: 8, colorChannels: 3 });
  });

  it('parses non-default floating-point metadata without misaligning extra channels', () => {
    const result = inspectJxl(bareCustomFloatingMetadata(), 'Floating-point input');
    expect(result.header).toMatchObject({
      metadataDefaults: false,
      bitDepth: 32,
      hasAlpha: 'Present if an extra channel is alpha',
    });
  });

  it('walks container boxes and reads the first jxlc payload', () => {
    const codestream = bareDefault();
    const bytes = Uint8Array.from([
      0, 0, 0, 12, 0x4a, 0x58, 0x4c, 0x20, 13, 10, 0x87, 10,
      0, 0, 0, codestream.length + 8, 0x6a, 0x78, 0x6c, 0x63, ...codestream,
    ]);
    const result = inspectJxl(bytes, 'Container');
    expect(result.format).toBe('ISOBMFF container');
    expect(result.boxes.map((box) => box.type)).toEqual(['JXL ', 'jxlc']);
    expect(result.header.width).toBe(8);
  });

  it('reports source-qualified malformed input', () => {
    expect(() => inspectJxl(Uint8Array.of(1, 2), 'Dropped file')).toThrow(/^Dropped file:/);
  });
});

describe('base64ToBytes', () => {
  it('decodes Base64 and labels invalid pasted data', () => {
    expect(base64ToBytes('/wo=')).toEqual(Uint8Array.of(0xff, 0x0a));
    expect(() => base64ToBytes('bad!')).toThrow(/^Base64 paste:/);
  });
});
