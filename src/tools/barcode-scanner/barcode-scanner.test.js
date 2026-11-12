import { describe, expect, it } from 'vitest';
import {
  decodeBarcodeFromImageData,
  decodeBarcodeModules,
  hasValidEanUpcChecksum,
} from './barcode-scanner.utils.js';

const L_PATTERNS = [
  '0001101', '0011001', '0010011', '0111101', '0100011',
  '0110001', '0101111', '0111011', '0110111', '0001011',
];
const R_PATTERNS = [
  '1110010', '1100110', '1101100', '1000010', '1011100',
  '1001110', '1010000', '1000100', '1001000', '1110100',
];
const PARITIES = [
  'LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG',
  'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL',
];
const G_PATTERNS = [
  '0100111', '0110011', '0011011', '0100001', '0011101',
  '0111001', '0000101', '0010001', '0001001', '0010111',
];

function eanModules(value) {
  const digits = [...value].map(Number);
  const left = digits.slice(1, 7).map((digit, index) =>
    (PARITIES[digits[0]][index] === 'L' ? L_PATTERNS : G_PATTERNS)[digit]
  ).join('');
  return `101${left}01010${digits.slice(7).map((digit) => R_PATTERNS[digit]).join('')}101`;
}

function imageFromModules(modules, scale = 3) {
  const width = (modules.length + 20) * scale;
  const height = 30;
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  for (let x = 0; x < modules.length; x += 1) {
    if (modules[x] !== '1') continue;
    for (let dx = 0; dx < scale; dx += 1) for (let y = 0; y < height; y += 1) {
      const offset = (y * width + (x + 10) * scale + dx) * 4;
      data[offset] = data[offset + 1] = data[offset + 2] = 0;
    }
  }
  return { data, width, height };
}

function transposeImageData({ data, width, height }) {
  const rotatedData = new Uint8ClampedArray(data.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sourceOffset = (y * width + x) * 4;
      const targetOffset = (x * height + y) * 4;
      rotatedData.set(data.subarray(sourceOffset, sourceOffset + 4), targetOffset);
    }
  }
  return { data: rotatedData, width: height, height: width };
}

function code128Modules() {
  return '2112141113231311232331112'
    .split('')
    .map((width, index) => (index % 2 === 0 ? '1' : '0').repeat(Number(width)))
    .join('');
}

describe('barcode decoding', () => {
  it('decodes a valid EAN-13 image and validates its check digit', () => {
    const value = '4006381333931';
    expect(decodeBarcodeFromImageData(imageFromModules(eanModules(value)))).toEqual({
      value,
      symbology: 'EAN-13',
      checksumValid: true,
    });
  });

  it('identifies a leading-zero EAN encoding as UPC-A', () => {
    expect(decodeBarcodeModules(eanModules('0036000291452'))).toEqual({
      value: '036000291452',
      symbology: 'UPC-A',
      checksumValid: true,
    });
  });

  it('decodes a valid Code 128-B sample', () => {
    expect(decodeBarcodeModules(code128Modules())).toEqual({
      value: 'A',
      symbology: 'Code 128',
      checksumValid: true,
    });
  });

  it('rejects a barcode with an invalid checksum', () => {
    expect(decodeBarcodeModules(eanModules('4006381333932'))).toBeNull();
    expect(hasValidEanUpcChecksum('4006381333932')).toBe(false);
  });

  it('returns no result when no barcode scanline is present', () => {
    const data = new Uint8ClampedArray(100 * 20 * 4).fill(255);
    expect(decodeBarcodeFromImageData({ data, width: 100, height: 20 })).toBeNull();
  });

  it.each([
    ['Code 128', code128Modules(), { value: 'A', symbology: 'Code 128', checksumValid: true }],
    ['EAN-13', eanModules('4006381333931'), {
      value: '4006381333931', symbology: 'EAN-13', checksumValid: true,
    }],
    ['UPC-A', eanModules('0036000291452'), {
      value: '036000291452', symbology: 'UPC-A', checksumValid: true,
    }],
  ])('decodes a 90-degree rotated %s image', (_name, modules, expected) => {
    const verticalBarcode = transposeImageData(imageFromModules(modules));
    expect(decodeBarcodeFromImageData(verticalBarcode)).toEqual(expected);
  });
});
