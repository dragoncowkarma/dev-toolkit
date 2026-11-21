const EXPLICIT_LITTLE_ENDIAN = '1.2.840.10008.1.2.1';
const IMPLICIT_LITTLE_ENDIAN = '1.2.840.10008.1.2';

const LONG_VALUE_VRS = new Set([
  'OB', 'OD', 'OF', 'OL', 'OV', 'OW', 'SQ', 'UC', 'UN', 'UR', 'UT',
]);

const TAGS = {
  '0002,0002': { name: 'Media Storage SOP Class UID', vr: 'UI' },
  '0002,0003': { name: 'Media Storage SOP Instance UID', vr: 'UI' },
  '0002,0010': { name: 'Transfer Syntax UID', vr: 'UI' },
  '0008,0020': { name: 'Study Date', vr: 'DA' },
  '0008,0060': { name: 'Modality', vr: 'CS' },
  '0010,0010': { name: 'Patient Name', vr: 'PN' },
  '0010,0020': { name: 'Patient ID', vr: 'LO' },
  '0028,0010': { name: 'Rows', vr: 'US' },
  '0028,0011': { name: 'Columns', vr: 'US' },
};

function textFromBytes(bytes) {
  return new TextDecoder('utf-8').decode(bytes).replace(/[\0 ]+$/u, '');
}

function requireBytes(view, offset, count, context) {
  if (offset + count > view.byteLength) {
    throw new Error(`Truncated ${context}.`);
  }
}

function tagKey(group, element) {
  return `${group.toString(16).padStart(4, '0')},${element.toString(16).padStart(4, '0')}`;
}

function readElement(view, offset, explicitVr) {
  requireBytes(view, offset, 8, 'element header');
  const group = view.getUint16(offset, true);
  const element = view.getUint16(offset + 2, true);
  const key = tagKey(group, element);
  let vr = TAGS[key]?.vr ?? 'UN';
  let valueOffset;
  let length;

  if (explicitVr) {
    vr = String.fromCharCode(view.getUint8(offset + 4), view.getUint8(offset + 5));
    if (LONG_VALUE_VRS.has(vr)) {
      requireBytes(view, offset, 12, 'element header');
      length = view.getUint32(offset + 8, true);
      valueOffset = offset + 12;
    } else {
      length = view.getUint16(offset + 6, true);
      valueOffset = offset + 8;
    }
  } else {
    length = view.getUint32(offset + 4, true);
    valueOffset = offset + 8;
  }

  if (length === 0xffffffff) {
    throw new Error(`Unsupported undefined-length element (${key}).`);
  }
  requireBytes(view, valueOffset, length, `value for (${key})`);
  return { group, element, key, vr, length, valueOffset, nextOffset: valueOffset + length };
}

function decodeValue(view, element) {
  const bytes = new Uint8Array(
    view.buffer, view.byteOffset + element.valueOffset, element.length
  );
  if (['UI', 'SH', 'LO', 'DA', 'TM', 'CS', 'PN'].includes(element.vr)) {
    return textFromBytes(bytes) || '(empty)';
  }
  if (element.vr === 'US' && element.length >= 2) {
    return String(view.getUint16(element.valueOffset, true));
  }
  if (element.vr === 'UL' && element.length >= 4) {
    return String(view.getUint32(element.valueOffset, true));
  }
  return element.length === 0 ? '(empty)' : `${element.length} bytes`;
}

function presentElement(view, element) {
  return {
    tag: `(${element.key})`,
    name: TAGS[element.key]?.name ?? 'Unknown Tag',
    vr: element.vr,
    length: element.length,
    value: decodeValue(view, element),
  };
}

/**
 * Parses a DICOM Part 10 header with Explicit or Implicit VR Little Endian data.
 *
 * @param {ArrayBuffer} arrayBuffer - Raw DICOM file data.
 * @returns {{ transferSyntax: string, fileMeta: object[], dataSet: object[] }} Parsed data.
 * @throws {Error} When the Part 10 header or an element is malformed.
 */
export function parseDicomHeader(arrayBuffer) {
  if (!(arrayBuffer instanceof ArrayBuffer)) {
    throw new TypeError('DICOM data must be an ArrayBuffer.');
  }
  if (arrayBuffer.byteLength < 132) {
    throw new Error(
      'DICOM file is shorter than the required 132-byte preamble and magic word.'
    );
  }
  const view = new DataView(arrayBuffer);
  const magic = String.fromCharCode(...new Uint8Array(arrayBuffer, 128, 4));
  if (magic !== 'DICM') throw new Error('Missing DICM magic word at offset 128.');

  let offset = 132;
  const fileMeta = [];
  let transferSyntax = '';
  while (offset < view.byteLength) {
    requireBytes(view, offset, 8, 'element header');
    const group = view.getUint16(offset, true);
    if (group !== 0x0002) break;
    const element = readElement(view, offset, true);
    const displayed = presentElement(view, element);
    fileMeta.push(displayed);
    if (element.key === '0002,0010') transferSyntax = displayed.value;
    offset = element.nextOffset;
  }

  if (!transferSyntax) {
    throw new Error('Missing Transfer Syntax UID in File Meta Information.');
  }
  if (![EXPLICIT_LITTLE_ENDIAN, IMPLICIT_LITTLE_ENDIAN].includes(transferSyntax)) {
    throw new Error(`Unsupported Transfer Syntax UID: ${transferSyntax}.`);
  }

  const dataSet = [];
  const explicitVr = transferSyntax === EXPLICIT_LITTLE_ENDIAN;
  while (offset < view.byteLength) {
    requireBytes(view, offset, 8, 'element header');
    const element = readElement(view, offset, explicitVr);
    dataSet.push(presentElement(view, element));
    offset = element.nextOffset;
  }
  return { transferSyntax, fileMeta, dataSet };
}

function encodeElement(group, element, vr, value, explicitVr = true) {
  const valueBytes = typeof value === 'number'
    ? new Uint8Array(vr === 'UL' ? 4 : 2)
    : new TextEncoder().encode(value);
  if (typeof value === 'number') {
    new DataView(valueBytes.buffer).setUint16(0, value, true);
  }
  const padded = valueBytes.length % 2 === 0
    ? valueBytes
    : Uint8Array.from([...valueBytes, 0]);
  const longVr = explicitVr && LONG_VALUE_VRS.has(vr);
  const header = new Uint8Array(longVr ? 12 : 8);
  const view = new DataView(header.buffer);
  view.setUint16(0, group, true);
  view.setUint16(2, element, true);
  if (explicitVr) {
    header[4] = vr.charCodeAt(0);
    header[5] = vr.charCodeAt(1);
    if (longVr) view.setUint32(8, padded.length, true);
    else view.setUint16(6, padded.length, true);
  } else {
    view.setUint32(4, padded.length, true);
  }
  return Uint8Array.from([...header, ...padded]);
}

/**
 * Creates a minimal browser-only DICOM example for trying the inspector.
 *
 * @returns {ArrayBuffer} A valid Explicit VR Little Endian Part 10 file.
 */
export function createSampleDicom() {
  const parts = [new Uint8Array(128), new TextEncoder().encode('DICM')];
  parts.push(encodeElement(0x0002, 0x0002, 'UI', '1.2.840.10008.5.1.4.1.1.2'));
  parts.push(encodeElement(0x0002, 0x0003, 'UI', '1.2.3.4.5.6.7.8.9'));
  parts.push(encodeElement(0x0002, 0x0010, 'UI', EXPLICIT_LITTLE_ENDIAN));
  parts.push(encodeElement(0x0010, 0x0010, 'PN', 'Sample^Patient'));
  parts.push(encodeElement(0x0010, 0x0020, 'LO', 'SAMPLE-001'));
  parts.push(encodeElement(0x0008, 0x0020, 'DA', '20261121'));
  parts.push(encodeElement(0x0008, 0x0060, 'CS', 'OT'));
  parts.push(encodeElement(0x0028, 0x0010, 'US', 256));
  parts.push(encodeElement(0x0028, 0x0011, 'US', 256));
  const length = parts.reduce((total, part) => total + part.length, 0);
  const sample = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    sample.set(part, offset);
    offset += part.length;
  }
  return sample.buffer;
}

export const DICOM_TRANSFER_SYNTAXES = { EXPLICIT_LITTLE_ENDIAN, IMPLICIT_LITTLE_ENDIAN };
