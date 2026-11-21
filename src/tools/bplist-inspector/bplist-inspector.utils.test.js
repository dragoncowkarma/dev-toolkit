import { describe, expect, it } from 'vitest';
import { parseBplist } from './bplist-inspector.utils.js';

function makeBplist(objects, topObject = objects.length - 1) {
  const objectBytes = objects.flat();
  const offsets = [];
  let offset = 8;
  for (const object of objects) {
    offsets.push(offset);
    offset += object.length;
  }
  const offsetTableOffset = offset;
  const bytes = new Uint8Array(8 + objectBytes.length + offsets.length + 32);
  bytes.set(new TextEncoder().encode('bplist00'));
  bytes.set(objectBytes, 8);
  bytes.set(offsets, offsetTableOffset);
  const trailer = bytes.length - 32;
  bytes[trailer + 6] = 1;
  bytes[trailer + 7] = 1;
  bytes[trailer + 15] = objects.length;
  bytes[trailer + 23] = topObject;
  bytes[trailer + 31] = offsetTableOffset;
  return bytes;
}

function nestedFixture() {
  return makeBplist([
    [0x54, 0x6e, 0x61, 0x6d, 0x65],
    [0x55, 0x69, 0x74, 0x65, 0x6d, 0x73],
    [0x56, 0x61, 0x6e, 0x73, 0x77, 0x65, 0x72],
    [0x10, 0x2a],
    [0x51, 0x78],
    [0xd1, 0x02, 0x03],
    [0xa2, 0x04, 0x05],
    [0xd2, 0x00, 0x01, 0x03, 0x06],
  ]);
}

describe('parseBplist', () => {
  it('parses a valid bplist with a nested array and dictionary', () => {
    const result = parseBplist(nestedFixture());

    expect(result.trailer).toMatchObject({
      offsetIntSize: 1,
      objectRefSize: 1,
      numberOfObjects: 8,
      topObject: 7,
    });
    expect(result.root).toEqual({
      type: 'dict',
      entries: [
        {
          key: { type: 'string', encoding: 'ASCII', value: 'name' },
          value: { type: 'integer', value: 42 },
        },
        {
          key: { type: 'string', encoding: 'ASCII', value: 'items' },
          value: {
            type: 'array',
            values: [
              { type: 'string', encoding: 'ASCII', value: 'x' },
              {
                type: 'dict',
                entries: [{
                  key: { type: 'string', encoding: 'ASCII', value: 'answer' },
                  value: { type: 'integer', value: 42 },
                }],
              },
            ],
          },
        },
      ],
    });
  });

  it('rejects a file with a non-bplist magic header', () => {
    const bytes = nestedFixture();
    bytes[0] = 0;
    expect(() => parseBplist(bytes)).toThrow(/not an Apple binary property list/);
  });

  it('rejects a truncated bplist', () => {
    expect(() => parseBplist(nestedFixture().subarray(0, 20))).toThrow(/truncated/);
  });

  it('rejects an offset table entry outside the object table', () => {
    const bytes = nestedFixture();
    const offsetTableOffset = bytes[bytes.length - 1];
    bytes[offsetTableOffset] = 2;
    expect(() => parseBplist(bytes)).toThrow(/outside the object table/);
  });

  it('decodes the remaining supported primitive object families', () => {
    const result = parseBplist(makeBplist([
      [0x00], [0x08], [0x09], [0x0f], [0x22, 0x3f, 0xc0, 0x00, 0x00],
      [0x33, 0, 0, 0, 0, 0, 0, 0, 0], [0x42, 0xca, 0xfe], [0x61, 0x00, 0x41],
      [0x80, 0xab], [0xc2, 0x00, 0x01], [0xaa, 0x00, 0x01, 0x02, 0x03, 0x04,
        0x05, 0x06, 0x07, 0x08, 0x09],
    ], 10));

    expect(result.root.values.map((item) => item.type)).toEqual([
      'null', 'boolean', 'boolean', 'fill', 'real', 'date', 'data', 'string', 'uid', 'set',
    ]);
    expect(result.root.values[4].value).toBe(1.5);
    expect(result.root.values[6]).toMatchObject({ bytes: 2, value: 'CA FE' });
    expect(result.root.values[7]).toMatchObject({ encoding: 'UTF-16BE', value: 'A' });
    expect(result.root.values[8]).toEqual({ type: 'uid', value: 171 });
  });
});
