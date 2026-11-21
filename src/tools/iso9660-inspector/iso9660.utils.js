export const LOGICAL_SECTOR_SIZE = 2048;
export const VOLUME_DESCRIPTOR_SECTOR = 16;

const TYPE_NAMES = {
  0: 'Boot Record',
  1: 'Primary Volume Descriptor',
  2: 'Supplementary Volume Descriptor',
  3: 'Volume Partition Descriptor',
  255: 'Volume Descriptor Set Terminator',
};

function trimText(bytes) {
  return new TextDecoder('ascii').decode(bytes).replace(/[ \0]+$/g, '');
}

function readLittleEndian(bytes, offset, length) {
  let value = 0;
  for (let index = length - 1; index >= 0; index -= 1) {
    value = value * 256 + bytes[offset + index];
  }
  return value;
}

function decodeUcs2Be(bytes) {
  let value = '';
  for (let index = 0; index + 1 < bytes.length; index += 2) {
    const codePoint = (bytes[index] << 8) | bytes[index + 1];
    if (codePoint === 0 || codePoint === 0x20) continue;
    value += String.fromCharCode(codePoint);
  }
  return value.trim();
}

function parseTimestamp(bytes) {
  const raw = new TextDecoder('ascii').decode(bytes.subarray(0, 16));
  if (!/^\d{16}$/.test(raw)) return { raw, formatted: 'Unspecified' };
  const offset = bytes[16] > 127 ? bytes[16] - 256 : bytes[16];
  const offsetMinutes = offset * 15;
  const offsetSign = offsetMinutes >= 0 ? '+' : '-';
  const absoluteOffset = Math.abs(offsetMinutes);
  const timezoneHour = String(Math.floor(absoluteOffset / 60)).padStart(2, '0');
  const timezone = `${offsetSign}${timezoneHour}:${String(
    absoluteOffset % 60
  ).padStart(2, '0')}`;
  return {
    raw,
    formatted: [
      `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`,
      `${raw.slice(8, 10)}:${raw.slice(10, 12)}:${raw.slice(12, 14)}.${raw.slice(14, 16)}`,
      timezone,
    ].join(' '),
  };
}

function parseRootDirectoryRecord(bytes, offset) {
  const recordLength = bytes[offset];
  if (recordLength < 34 || offset + recordLength > bytes.length) return null;
  return {
    recordLength,
    extentLocation: readLittleEndian(bytes, offset + 2, 4),
    dataLength: readLittleEndian(bytes, offset + 10, 4),
    fileFlags: bytes[offset + 25],
  };
}

function parsePrimaryDescriptor(bytes) {
  return {
    volumeIdentifier: trimText(bytes.subarray(40, 72)),
    volumeSpaceSize: readLittleEndian(bytes, 80, 4),
    logicalBlockSize: readLittleEndian(bytes, 128, 2),
    pathTableSize: readLittleEndian(bytes, 132, 4),
    pathTableLocation: readLittleEndian(bytes, 140, 4),
    rootDirectoryRecord: parseRootDirectoryRecord(bytes, 156),
    volumeSetIdentifier: trimText(bytes.subarray(190, 318)),
    publisherIdentifier: trimText(bytes.subarray(318, 446)),
    dataPreparerIdentifier: trimText(bytes.subarray(446, 574)),
    applicationIdentifier: trimText(bytes.subarray(574, 702)),
    creationDateTime: parseTimestamp(bytes.subarray(813, 830)),
    modificationDateTime: parseTimestamp(bytes.subarray(830, 847)),
  };
}

function jolietLevel(bytes) {
  if (bytes[88] !== 0x25 || bytes[89] !== 0x2f) return null;
  return { 0x40: 1, 0x43: 2, 0x45: 3 }[bytes[90]] ?? null;
}

/**
 * Parses ISO 9660 volume descriptors from an in-memory image without performing I/O.
 * @param {ArrayBuffer|Uint8Array} image
 * @returns {{descriptors: object[], primaryVolume: object|null, jolietVolume: object|null,
 * errors: string[]}}
 */
export function parseIso9660(image) {
  const bytes = image instanceof Uint8Array ? image : new Uint8Array(image);
  const descriptors = [];
  const errors = [];
  let primaryVolume = null;
  let jolietVolume = null;
  let foundTerminator = false;
  let sector = VOLUME_DESCRIPTOR_SECTOR;

  while (true) {
    const offset = sector * LOGICAL_SECTOR_SIZE;
    if (offset + LOGICAL_SECTOR_SIZE > bytes.length) {
      errors.push(`Truncated volume descriptor at logical sector ${sector}.`);
      break;
    }

    const descriptorBytes = bytes.subarray(offset, offset + LOGICAL_SECTOR_SIZE);
    const type = descriptorBytes[0];
    const standardIdentifier = new TextDecoder('ascii').decode(descriptorBytes.subarray(1, 6));
    const validSignature = standardIdentifier === 'CD001';
    const descriptor = {
      sector,
      type,
      typeName: TYPE_NAMES[type] ?? `Unknown Type (${type})`,
      standardIdentifier,
      validSignature,
    };
    descriptors.push(descriptor);

    if (!validSignature) {
      errors.push(
        `Invalid Standard Identifier at logical sector ${sector}: "${standardIdentifier}".`
      );
    }
    if (type === 1 && !primaryVolume) primaryVolume = parsePrimaryDescriptor(descriptorBytes);
    if (type === 2) {
      const level = jolietLevel(descriptorBytes);
      if (level) {
        jolietVolume = {
          level,
          volumeIdentifier: decodeUcs2Be(descriptorBytes.subarray(40, 72)),
        };
        descriptor.jolietLevel = level;
      }
    }
    if (type === 255) {
      foundTerminator = true;
      break;
    }
    sector += 1;
  }

  if (!foundTerminator && errors.length === 0) {
    errors.push('Volume Descriptor Set Terminator was not found before truncation.');
  }
  if (!primaryVolume) errors.push('Primary Volume Descriptor was not found.');
  return { descriptors, primaryVolume, jolietVolume, errors };
}
