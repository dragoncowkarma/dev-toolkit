import { describe, expect, it } from 'vitest';
import {
  createSampleDicom,
  DICOM_TRANSFER_SYNTAXES,
  parseDicomHeader,
} from './dicomParser.js';

function element(group, tag, vr, value, explicit = true) {
  const bytes = new TextEncoder().encode(value);
  const padded = bytes.length % 2 === 0 ? bytes : Uint8Array.from([...bytes, 0]);
  const header = new Uint8Array(8);
  const view = new DataView(header.buffer);
  view.setUint16(0, group, true);
  view.setUint16(2, tag, true);
  if (explicit) {
    header[4] = vr.charCodeAt(0);
    header[5] = vr.charCodeAt(1);
    view.setUint16(6, padded.length, true);
  } else {
    view.setUint32(4, padded.length, true);
  }
  return Uint8Array.from([...header, ...padded]);
}

function implicitDicom() {
  const parts = [new Uint8Array(128), new TextEncoder().encode('DICM')];
  parts.push(element(0x0002, 0x0010, 'UI', DICOM_TRANSFER_SYNTAXES.IMPLICIT_LITTLE_ENDIAN));
  parts.push(element(0x0010, 0x0010, 'PN', 'Implicit^Patient', false));
  const size = parts.reduce((total, part) => total + part.length, 0);
  const result = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result.buffer;
}

describe('parseDicomHeader', () => {
  it('parses a valid minimal Explicit VR Little Endian DICOM file', () => {
    const result = parseDicomHeader(createSampleDicom());

    expect(result.transferSyntax).toBe(DICOM_TRANSFER_SYNTAXES.EXPLICIT_LITTLE_ENDIAN);
    expect(result.fileMeta.find((item) => item.name === 'Transfer Syntax UID')?.value)
      .toBe(DICOM_TRANSFER_SYNTAXES.EXPLICIT_LITTLE_ENDIAN);
    expect(result.dataSet.find((item) => item.name === 'Patient Name')?.value)
      .toBe('Sample^Patient');
    expect(result.dataSet.find((item) => item.name === 'Rows')?.value).toBe('256');
  });

  it('parses an Implicit VR Little Endian data set', () => {
    const result = parseDicomHeader(implicitDicom());

    expect(result.transferSyntax).toBe(DICOM_TRANSFER_SYNTAXES.IMPLICIT_LITTLE_ENDIAN);
    expect(result.dataSet[0]).toMatchObject({ vr: 'PN', value: 'Implicit^Patient' });
  });

  it('rejects a file without the DICM magic word', () => {
    const invalid = createSampleDicom().slice(0);
    new Uint8Array(invalid, 128, 4).fill(0);

    expect(() => parseDicomHeader(invalid)).toThrow('Missing DICM magic word');
  });

  it('rejects a file with a truncated preamble', () => {
    expect(() => parseDicomHeader(new ArrayBuffer(131)))
      .toThrow('shorter than the required 132');
  });

  it('rejects truncated element headers and values', () => {
    const headerOnly = new Uint8Array(136);
    headerOnly.set(new TextEncoder().encode('DICM'), 128);
    expect(() => parseDicomHeader(headerOnly.buffer)).toThrow('Truncated element header');

    const truncatedValue = new Uint8Array(140);
    truncatedValue.set(new TextEncoder().encode('DICM'), 128);
    const view = new DataView(truncatedValue.buffer);
    view.setUint16(132, 0x0002, true);
    view.setUint16(134, 0x0010, true);
    truncatedValue.set(new TextEncoder().encode('UI'), 136);
    view.setUint16(138, 10, true);
    expect(() => parseDicomHeader(truncatedValue.buffer)).toThrow('Truncated value');
  });
});
