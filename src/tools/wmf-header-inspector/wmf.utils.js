const PLACEABLE_MAGIC = 0x9ac6cdd7;
const PLACEABLE_SIZE = 22;
const META_HEADER_SIZE = 18;
const META_HEADER_WORDS = 9;

/** Decode user-provided hexadecimal or Base64 bytes without throwing. */
export function decodeInput(input, format) {
  try {
    const text = input.replace(/\s/g, '');
    if (format === 'hex') {
      if (!text || text.length % 2 || !/^[0-9a-f]+$/i.test(text)) {
        return { ok: false, error: 'Enter an even number of hexadecimal digits.' };
      }
      return { ok: true, bytes: Uint8Array.from(text.match(/../g), (pair) => parseInt(pair, 16)) };
    }
    if (format !== 'base64' || !text || text.length % 4 ||
        !/^[A-Za-z0-9+/]*={0,2}$/.test(text)) {
      return { ok: false, error: 'Enter valid padded Base64 input.' };
    }
    const binary = atob(text);
    return { ok: true, bytes: Uint8Array.from(binary, (char) => char.charCodeAt(0)) };
  } catch {
    return { ok: false, error: 'Could not decode the input.' };
  }
}

/** Compute the Aldus placeable header checksum (XOR of the first ten 16-bit words). */
export function computePlaceableChecksum(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let checksum = 0;
  for (let index = 0; index < 10; index += 1) {
    checksum ^= view.getUint16(index * 2, true);
  }
  return checksum;
}

/** Parse a WMF placeable and standard META_HEADER from an ArrayBuffer or Uint8Array. */
export function parseWmfHeader(input) {
  try {
    const bytes = input instanceof ArrayBuffer ? new Uint8Array(input) : input;
    if (!(bytes instanceof Uint8Array) || bytes.byteLength < META_HEADER_SIZE) {
      return { ok: false, error: 'The WMF header is truncated.' };
    }
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const u16 = (offset) => view.getUint16(offset, true);
    const i16 = (offset) => view.getInt16(offset, true);
    const u32 = (offset) => view.getUint32(offset, true);
    const isPlaceable = u32(0) === PLACEABLE_MAGIC;
    const isNonPlaceableCandidate = (u16(0) === 1 || u16(0) === 2) && u16(2) === META_HEADER_WORDS;

    if (!isPlaceable && !isNonPlaceableCandidate) {
      return { ok: false, error: 'Invalid WMF magic signature or header type.' };
    }
    if (isPlaceable && bytes.byteLength < PLACEABLE_SIZE + META_HEADER_SIZE) {
      return { ok: false, error: 'The WMF placeable header is truncated.' };
    }

    let placeableFields = {
      placeable: false, magic: null, handle: null, bounds: null,
      unitsPerInch: null, reserved: null, checksum: null, expectedChecksum: null,
    };

    if (isPlaceable) {
      const bounds = [i16(6), i16(8), i16(10), i16(12)];
      const unitsPerInch = u16(14);
      const reserved = u32(16);
      const checksum = u16(20);
      const expectedChecksum = computePlaceableChecksum(bytes);
      if (checksum !== expectedChecksum) {
        return { ok: false, error: 'Placeable header checksum mismatch.' };
      }
      if (bounds[0] >= bounds[2] || bounds[1] >= bounds[3]) {
        return { ok: false, error: 'Invalid placeable bounding box coordinates.' };
      }
      if (!unitsPerInch) {
        return { ok: false, error: 'Units per inch must be greater than zero.' };
      }
      if (reserved !== 0) {
        return { ok: false, error: 'Placeable header reserved field must be zero.' };
      }
      placeableFields = {
        placeable: true, magic: PLACEABLE_MAGIC, handle: u16(4), bounds,
        unitsPerInch, reserved, checksum, expectedChecksum,
      };
    }

    const offset = isPlaceable ? PLACEABLE_SIZE : 0;
    const type = u16(offset);
    const headerSize = u16(offset + 2);
    const version = u16(offset + 4);
    const fileSize = u32(offset + 6);
    const objectCount = u16(offset + 10);
    const maxRecord = u32(offset + 12);
    const memberCount = u16(offset + 16);

    if (type !== 1 && type !== 2) {
      return { ok: false, error: 'Invalid META_HEADER type.' };
    }
    if (headerSize !== META_HEADER_WORDS) {
      return { ok: false, error: 'Invalid META_HEADER size.' };
    }
    if (version !== 0x0100 && version !== 0x0300) {
      return { ok: false, error: 'Unsupported WMF version.' };
    }
    if (fileSize < headerSize || fileSize * 2 !== bytes.byteLength - offset) {
      return { ok: false, error: 'Declared file size does not match the metafile length.' };
    }
    if (maxRecord > fileSize) {
      return { ok: false, error: 'Max record size exceeds the declared file size.' };
    }

    return {
      ok: true,
      header: {
        ...placeableFields,
        type,
        headerSize,
        headerBytes: headerSize * 2,
        version,
        fileSize,
        fileBytes: fileSize * 2,
        objectCount,
        maxRecord,
        memberCount,
      },
    };
  } catch {
    return { ok: false, error: 'Could not parse the WMF header.' };
  }
}
