import { describe, expect, it } from 'vitest';
import {
  LOGICAL_SECTOR_SIZE,
  VOLUME_DESCRIPTOR_SECTOR,
  parseIso9660,
} from './iso9660.utils.js';

const encoder = new TextEncoder();

function writeAscii(bytes, offset, value) {
  bytes.set(encoder.encode(value), offset);
}

function writeLittleEndian(bytes, offset, value, length) {
  for (let index = 0; index < length; index += 1) {
    bytes[offset + index] = (value >>> (index * 8)) & 0xff;
  }
}

function writeUcs2Be(bytes, offset, value) {
  for (let index = 0; index < value.length; index += 1) {
    bytes[offset + index * 2] = value.charCodeAt(index) >> 8;
    bytes[offset + index * 2 + 1] = value.charCodeAt(index) & 0xff;
  }
}

function descriptor(type, identifier = 'CD001') {
  const bytes = new Uint8Array(LOGICAL_SECTOR_SIZE);
  bytes[0] = type;
  writeAscii(bytes, 1, identifier);
  bytes[6] = 1;
  return bytes;
}

function primaryDescriptor() {
  const bytes = descriptor(1);
  writeAscii(bytes, 40, 'DEMO_DISC');
  writeLittleEndian(bytes, 80, 1234, 4);
  writeLittleEndian(bytes, 128, 2048, 2);
  writeLittleEndian(bytes, 132, 44, 4);
  writeLittleEndian(bytes, 140, 22, 4);
  bytes[156] = 34;
  writeLittleEndian(bytes, 158, 24, 4);
  writeLittleEndian(bytes, 166, 4096, 4);
  writeAscii(bytes, 190, 'SET_A');
  writeAscii(bytes, 318, 'PUBLISHER');
  writeAscii(bytes, 446, 'PREPARER');
  writeAscii(bytes, 574, 'ISO Inspector');
  writeAscii(bytes, 813, '2026112112345600');
  bytes[829] = 0;
  writeAscii(bytes, 830, '2026112212345600');
  bytes[846] = 4;
  return bytes;
}

function imageFromDescriptors(descriptors) {
  const sectorCount = VOLUME_DESCRIPTOR_SECTOR + descriptors.length;
  const image = new Uint8Array(sectorCount * LOGICAL_SECTOR_SIZE);
  descriptors.forEach((item, index) => {
    image.set(item, (VOLUME_DESCRIPTOR_SECTOR + index) * LOGICAL_SECTOR_SIZE);
  });
  return image;
}

describe('parseIso9660', () => {
  it('parses a valid image containing a primary volume descriptor', () => {
    const result = parseIso9660(imageFromDescriptors([primaryDescriptor(), descriptor(255)]));

    expect(result.errors).toEqual([]);
    expect(result.descriptors).toHaveLength(2);
    expect(result.primaryVolume).toMatchObject({
      volumeIdentifier: 'DEMO_DISC',
      volumeSpaceSize: 1234,
      logicalBlockSize: 2048,
      pathTableSize: 44,
      pathTableLocation: 22,
      volumeSetIdentifier: 'SET_A',
      publisherIdentifier: 'PUBLISHER',
      dataPreparerIdentifier: 'PREPARER',
      applicationIdentifier: 'ISO Inspector',
    });
    expect(result.primaryVolume.rootDirectoryRecord).toMatchObject({
      extentLocation: 24,
      dataLength: 4096,
    });
    expect(result.primaryVolume.creationDateTime.formatted)
      .toBe('2026-11-21 12:34:56.00 +00:00');
  });

  it('identifies and decodes a Joliet supplementary volume descriptor', () => {
    const joliet = descriptor(2);
    joliet.set([0x25, 0x2f, 0x45], 88);
    writeUcs2Be(joliet, 40, 'JOLIET');

    const result = parseIso9660(
      imageFromDescriptors([primaryDescriptor(), joliet, descriptor(255)])
    );

    expect(result.errors).toEqual([]);
    expect(result.jolietVolume).toEqual({ level: 3, volumeIdentifier: 'JOLIET' });
    expect(result.descriptors[1]).toMatchObject({
      typeName: 'Supplementary Volume Descriptor',
      jolietLevel: 3,
    });
  });

  it('reports a truncated image and a missing primary descriptor without throwing', () => {
    const image = new Uint8Array((VOLUME_DESCRIPTOR_SECTOR + 1) * LOGICAL_SECTOR_SIZE);
    expect(() => parseIso9660(image)).not.toThrow();
    expect(parseIso9660(image).errors).toEqual(expect.arrayContaining([
      `Truncated volume descriptor at logical sector ${VOLUME_DESCRIPTOR_SECTOR + 1}.`,
      'Primary Volume Descriptor was not found.',
    ]));
  });

  it('reports an invalid standard identifier', () => {
    const result = parseIso9660(imageFromDescriptors([
      primaryDescriptor(),
      descriptor(255, 'NOPE!'),
    ]));

    expect(result.errors).toContain('Invalid Standard Identifier at logical sector 17: "NOPE!".');
    expect(result.descriptors[1].validSignature).toBe(false);
  });
});
