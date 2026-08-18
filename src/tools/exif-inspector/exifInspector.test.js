import { describe, expect, it } from 'vitest';
import { decodeExifInput, MAX_INPUT_SIZE, parseExif } from './exifInspector.utils.js';

const REFERENCE_HEX = '49492a000800000004000f0102000400000041424300100102000300000058590000' +
  '12010300010000000100000069870400010000003e000000000000000100039002001400000050000000' +
  '00000000323032343a30313a30312030303a30303a303000';
const REFERENCE_BASE64 = 'SUkqAAgAAAAEAA8BAgAEAAAAQUJDABABAgADAAAAWFkAABIBAwABAAAAAQAAAGmHBAAB' +
  'AAAAPgAAAAAAAAABAAOQAgAUAAAAUAAAAAAAAAAyMDI0OjAxOjAxIDAwOjAwOjAwAA==';

function bytesFromHex(value) {
  return Uint8Array.from(value.match(/../g), (pair) => Number.parseInt(pair, 16));
}

function buildGpsTiff() {
  const bytes = new Uint8Array(128);
  const view = new DataView(bytes.buffer);
  const u16 = (offset, value) => view.setUint16(offset, value, true);
  const u32 = (offset, value) => view.setUint32(offset, value, true);
  bytes.set([0x49, 0x49, 0x2a, 0, 8, 0, 0, 0]);
  u16(8, 1); u16(10, 0x8825); u16(12, 4); u32(14, 1); u32(18, 26); u32(22, 0);
  u16(26, 4);
  [[1, 2, 2, 0x4e], [2, 5, 3, 80], [3, 2, 2, 0x57], [4, 5, 3, 104]].forEach((entry, index) => {
    const offset = 28 + index * 12;
    u16(offset, entry[0]); u16(offset + 2, entry[1]); u32(offset + 4, entry[2]); u32(offset + 8, entry[3]);
  });
  u32(76, 0);
  [[37, 1], [30, 1], [0, 1], [127, 1], [15, 1], [0, 1]].forEach((pair, index) => {
    u32(80 + index * 8, pair[0]); u32(84 + index * 8, pair[1]);
  });
  return bytes;
}

function makeJpeg(tiff) {
  const length = tiff.length + 8;
  return Uint8Array.from([0xff, 0xd8, 0xff, 0xe1, length >> 8, length & 0xff, 0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff, 0xff, 0xd9]);
}

describe('decodeExifInput', () => {
  it('decodes hex with prefixes and separators, and resolves Auto visibly', () => {
    const result = decodeExifInput('0x49:49-2A 00', 'auto');
    expect(result.format).toBe('hex');
    expect(Array.from(result.bytes)).toEqual([0x49, 0x49, 0x2a, 0]);
  });

  it('decodes unpadded base64url', () => {
    const result = decodeExifInput('SUkqAA', 'base64');
    expect(result.format).toBe('base64');
    expect(Array.from(result.bytes)).toEqual([0x49, 0x49, 0x2a, 0]);
  });

  it('reports malformed hex and base64 separately', () => {
    expect(decodeExifInput('ABC', 'hex').error).toMatch(/Malformed hex/);
    expect(decodeExifInput('abc$', 'base64').error).toMatch(/Malformed base64/);
  });

  it('rejects inputs above the 1 MiB cap before parsing', () => {
    const input = 'A'.repeat(Math.ceil((MAX_INPUT_SIZE + 1) * 4 / 3));
    expect(decodeExifInput(input, 'base64').error).toMatch(/Payload too large/);
  });
});

describe('parseExif', () => {
  it('parses the supplied reference TIFF from hex and base64 without throwing', () => {
    [bytesFromHex(REFERENCE_HEX), decodeExifInput(REFERENCE_BASE64, 'base64').bytes].forEach((bytes) => {
      expect(() => parseExif(bytes)).not.toThrow();
      const result = parseExif(bytes);
      const ifd0 = result.groups.find((group) => group.name === 'IFD0');
      const exif = result.groups.find((group) => group.name === 'Exif SubIFD');
      expect(ifd0.fields.map((field) => [field.name, field.value])).toContainEqual(['Make', 'ABC']);
      expect(ifd0.fields.map((field) => [field.name, field.value])).toContainEqual(['Model', 'XY']);
      expect(ifd0.fields.map((field) => [field.name, field.value])).toContainEqual(['Orientation', '1']);
      expect(exif.fields.map((field) => [field.name, field.value])).toContainEqual([
        'DateTimeOriginal', '2024:01:01 00:00:00',
      ]);
    });
  });

  it('honors big-endian TIFF fields', () => {
    const bytes = new Uint8Array(30);
    const view = new DataView(bytes.buffer);
    bytes.set([0x4d, 0x4d]); view.setUint16(2, 42); view.setUint32(4, 8); view.setUint16(8, 1);
    view.setUint16(10, 0x0112); view.setUint16(12, 3); view.setUint32(14, 1); view.setUint16(18, 8);
    view.setUint32(22, 0);
    expect(parseExif(bytes).groups[0].fields[0]).toMatchObject({ name: 'Orientation', value: '8' });
  });

  it('parses JPEG APP1 EXIF and specifically reports a JPEG with no EXIF', () => {
    const tiff = bytesFromHex(REFERENCE_HEX);
    expect(parseExif(makeJpeg(tiff)).groups.some((group) => group.name === 'IFD0')).toBe(true);
    expect(parseExif(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]).slice()).error).toMatch(/No EXIF data found/);
  });

  it('derives signed decimal GPS coordinates and retains raw DMS fields', () => {
    const result = parseExif(buildGpsTiff());
    expect(result.gpsCoordinates).toMatchObject({ latitude: 37.5, longitude: -127.25, text: '37.5, -127.25' });
    expect(result.groups.find((group) => group.name === 'GPS IFD').fields.map((field) => field.value)).toContain('37/1, 30/1, 0/1');
  });

  it('reports unknown tags and MakerNote as raw hexadecimal content', () => {
    const bytes = bytesFromHex(REFERENCE_HEX);
    const view = new DataView(bytes.buffer);
    view.setUint16(10, 0xc001, true);
    expect(parseExif(bytes).groups.find((group) => group.name === 'IFD0').fields[0].name).toBe('Tag 0xC001');
    view.setUint16(10, 0x927c, true);
    expect(parseExif(bytes).groups.find((group) => group.name === 'IFD0').fields[0].value).toBe('41424300');
  });

  it('returns offset-bearing errors for truncation, invalid order, bad offsets, and cycles', () => {
    const reference = bytesFromHex(REFERENCE_HEX);
    const badOrder = reference.slice(); badOrder[0] = 0x58;
    const badOffset = reference.slice(); new DataView(badOffset.buffer).setUint32(54, 9999, true);
    const cycle = reference.slice(); new DataView(cycle.buffer).setUint32(54, 8, true);
    [reference.slice(0, 5), badOrder, badOffset, cycle].forEach((bytes) => {
      expect(() => parseExif(bytes)).not.toThrow();
      expect(parseExif(bytes).error).toMatch(/byte offset/);
    });
  });

  it('caps long IFD chains instead of looping forever', () => {
    const bytes = new Uint8Array(8 + 36 * 6);
    const view = new DataView(bytes.buffer); bytes.set([0x49, 0x49, 0x2a, 0, 8, 0, 0, 0]);
    Array.from({ length: 36 }, (_, index) => {
      const offset = 8 + index * 6; view.setUint16(offset, 0, true); view.setUint32(offset + 2, index === 35 ? 0 : offset + 6, true);
    });
    expect(parseExif(bytes).error).toMatch(/IFD limit/);
  });
});
