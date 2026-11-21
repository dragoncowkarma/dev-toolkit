const MAGIC = 'bplist00';
const TRAILER_SIZE = 32;
const APPLE_EPOCH_MS = Date.UTC(2001, 0, 1);

/**
 * Parses an Apple binary property list into a readable object tree.
 *
 * @param {ArrayBuffer|Uint8Array} input - The complete binary property list.
 * @returns {{trailer: object, root: object}} Parsed trailer metadata and root object.
 * @throws {Error} When the input is not a valid, supported bplist00 document.
 */
export function parseBplist(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  validateHeader(bytes);
  if (bytes.length < MAGIC.length + TRAILER_SIZE) {
    throw new Error('The bplist00 file is truncated before its trailer.');
  }

  const trailer = readTrailer(bytes);
  const objectTableEnd = trailer.offsetTableOffset;
  const offsetTableLength = checkedMultiply(trailer.numberOfObjects, trailer.offsetIntSize);
  const offsetTableEnd = checkedAdd(trailer.offsetTableOffset, offsetTableLength);
  if (trailer.offsetTableOffset < MAGIC.length || offsetTableEnd > bytes.length - TRAILER_SIZE) {
    throw new Error('The offset table is outside the object table.');
  }
  if (trailer.topObject >= trailer.numberOfObjects) {
    throw new Error('The top object index is outside the offset table.');
  }

  const offsets = Array.from({ length: trailer.numberOfObjects }, (_, index) => {
    const position = trailer.offsetTableOffset + index * trailer.offsetIntSize;
    const offset = readUnsigned(bytes, position, trailer.offsetIntSize, 'object offset');
    if (offset < MAGIC.length || offset >= objectTableEnd) {
      throw new Error(`Object offset ${index} points outside the object table.`);
    }
    return offset;
  });

  const cache = new Map();
  const activeReferences = new Set();

  function decode(reference) {
    if (!Number.isInteger(reference) || reference < 0 || reference >= offsets.length) {
      throw new Error(`Object reference ${reference} is outside the offset table.`);
    }
    if (cache.has(reference)) return cache.get(reference);
    if (activeReferences.has(reference)) {
      throw new Error('The bplist object graph contains a circular reference.');
    }
    activeReferences.add(reference);
    const value = decodeObject(bytes, offsets[reference], objectTableEnd, trailer, decode);
    activeReferences.delete(reference);
    cache.set(reference, value);
    return value;
  }

  return { trailer, root: decode(trailer.topObject) };
}

/**
 * Reads a browser File without sending it anywhere.
 *
 * @param {File|Blob} file - The selected local file.
 * @returns {Promise<ArrayBuffer>} The raw file bytes.
 */
export function readBplistFile(file) {
  if (!file || typeof file.arrayBuffer !== 'function') {
    return Promise.reject(new TypeError('Please select a file to inspect.'));
  }
  return file.arrayBuffer();
}

function validateHeader(bytes) {
  if (bytes.length < MAGIC.length) {
    throw new Error('The file is too short to contain a bplist00 header.');
  }
  const header = new TextDecoder('ascii').decode(bytes.subarray(0, MAGIC.length));
  if (header !== MAGIC) {
    throw new Error('This file is not an Apple binary property list (bplist00).');
  }
}

function readTrailer(bytes) {
  const start = bytes.length - TRAILER_SIZE;
  const sortVersion = bytes[start + 5];
  const offsetIntSize = bytes[start + 6];
  const objectRefSize = bytes[start + 7];
  if (!isIntegerWidth(offsetIntSize) || !isIntegerWidth(objectRefSize)) {
    throw new Error('The bplist trailer has an invalid integer size.');
  }
  const numberOfObjects = readUnsigned(bytes, start + 8, 8, 'object count');
  const topObject = readUnsigned(bytes, start + 16, 8, 'top object index');
  const offsetTableOffset = readUnsigned(bytes, start + 24, 8, 'offset table offset');
  if (numberOfObjects === 0) {
    throw new Error('The bplist contains no objects.');
  }
  return {
    sortVersion, offsetIntSize, objectRefSize, numberOfObjects, topObject, offsetTableOffset,
  };
}

function decodeObject(bytes, offset, limit, trailer, decode) {
  requireRange(offset, 1, limit, 'object marker');
  const marker = bytes[offset];
  const type = marker >> 4;
  const info = marker & 0x0f;
  const contentOffset = offset + 1;

  if (type === 0x0) return decodeSimple(info);
  if (type === 0x1) return decodeInteger(bytes, contentOffset, info, limit);
  if (type === 0x2) return decodeReal(bytes, contentOffset, info, limit);
  if (type === 0x3) return decodeDate(bytes, contentOffset, info, limit);
  if (type === 0x4) return decodeData(bytes, contentOffset, info, limit);
  if (type === 0x5) return decodeAsciiString(bytes, contentOffset, info, limit);
  if (type === 0x6) return decodeUtf16String(bytes, contentOffset, info, limit);
  if (type === 0x8) return decodeUid(bytes, contentOffset, info, limit);
  if (type === 0xa || type === 0xc) {
    return decodeSequence(bytes, contentOffset, info, limit, trailer, decode, type);
  }
  if (type === 0xd) return decodeDictionary(bytes, contentOffset, info, limit, trailer, decode);
  throw new Error(`Unsupported bplist object marker 0x${marker.toString(16).padStart(2, '0')}.`);
}

function decodeSimple(info) {
  const values = {
    0: ['null', null], 8: ['boolean', false], 9: ['boolean', true], 15: ['fill', null],
  };
  const value = values[info];
  if (!value) throw new Error(`Unsupported simple object marker 0x0${info.toString(16)}.`);
  return { type: value[0], value: value[1] };
}

function decodeInteger(bytes, offset, info, limit) {
  const size = 2 ** info;
  if (![1, 2, 4, 8].includes(size)) throw new Error('The bplist integer width is unsupported.');
  requireRange(offset, size, limit, 'integer');
  const view = new DataView(bytes.buffer, bytes.byteOffset + offset, size);
  if (size === 8) {
    const value = view.getBigInt64(0, false);
    return { type: 'integer', value: bigintToDisplay(value) };
  }
  const value = size === 1
    ? view.getInt8(0)
    : size === 2 ? view.getInt16(0, false) : view.getInt32(0, false);
  return { type: 'integer', value };
}

function decodeReal(bytes, offset, info, limit) {
  const size = 2 ** info;
  if (![4, 8].includes(size)) throw new Error('The bplist real width is unsupported.');
  requireRange(offset, size, limit, 'real');
  const view = new DataView(bytes.buffer, bytes.byteOffset + offset, size);
  const value = size === 4 ? view.getFloat32(0, false) : view.getFloat64(0, false);
  return { type: 'real', value };
}

function decodeDate(bytes, offset, info, limit) {
  if (info !== 3) throw new Error('The bplist date has an invalid width.');
  requireRange(offset, 8, limit, 'date');
  const seconds = new DataView(bytes.buffer, bytes.byteOffset + offset, 8).getFloat64(0, false);
  const date = new Date(APPLE_EPOCH_MS + seconds * 1000);
  if (Number.isNaN(date.getTime())) throw new Error('The bplist date is invalid.');
  return {
    type: 'date', value: date.toISOString(), secondsSince2001: seconds,
  };
}

function decodeData(bytes, offset, info, limit) {
  const { count, contentOffset } = readCount(bytes, offset, info, limit);
  requireRange(contentOffset, count, limit, 'data');
  const value = Array.from(bytes.subarray(contentOffset, contentOffset + count), toHex).join(' ');
  return { type: 'data', bytes: count, value };
}

function decodeAsciiString(bytes, offset, info, limit) {
  const { count, contentOffset } = readCount(bytes, offset, info, limit);
  requireRange(contentOffset, count, limit, 'ASCII string');
  const stringBytes = bytes.subarray(contentOffset, contentOffset + count);
  const value = new TextDecoder('ascii').decode(stringBytes);
  return { type: 'string', encoding: 'ASCII', value };
}

function decodeUtf16String(bytes, offset, info, limit) {
  const { count, contentOffset } = readCount(bytes, offset, info, limit);
  const byteLength = checkedMultiply(count, 2);
  requireRange(contentOffset, byteLength, limit, 'UTF-16 string');
  const data = bytes.slice(contentOffset, contentOffset + byteLength);
  for (let index = 0; index < data.length; index += 2) {
    [data[index], data[index + 1]] = [data[index + 1], data[index]];
  }
  const value = new TextDecoder('utf-16le', { fatal: true }).decode(data);
  return { type: 'string', encoding: 'UTF-16BE', value };
}

function decodeUid(bytes, offset, info, limit) {
  const size = info + 1;
  requireRange(offset, size, limit, 'UID');
  return { type: 'uid', value: readUnsigned(bytes, offset, size, 'UID') };
}

function decodeSequence(bytes, offset, info, limit, trailer, decode, type) {
  const { count, contentOffset } = readCount(bytes, offset, info, limit);
  const byteLength = checkedMultiply(count, trailer.objectRefSize);
  requireRange(contentOffset, byteLength, limit, 'object references');
  const values = Array.from({ length: count }, (_, index) => {
    const refOffset = contentOffset + index * trailer.objectRefSize;
    return decode(readUnsigned(bytes, refOffset, trailer.objectRefSize, 'object reference'));
  });
  return { type: type === 0xa ? 'array' : 'set', values };
}

function decodeDictionary(bytes, offset, info, limit, trailer, decode) {
  const { count, contentOffset } = readCount(bytes, offset, info, limit);
  const byteLength = checkedMultiply(checkedMultiply(count, 2), trailer.objectRefSize);
  requireRange(contentOffset, byteLength, limit, 'dictionary references');
  const entries = Array.from({ length: count }, (_, index) => {
    const keyOffset = contentOffset + index * trailer.objectRefSize;
    const valueOffset = contentOffset + (count + index) * trailer.objectRefSize;
    return {
      key: decode(
        readUnsigned(bytes, keyOffset, trailer.objectRefSize, 'dictionary key reference')
      ),
      value: decode(
        readUnsigned(bytes, valueOffset, trailer.objectRefSize, 'dictionary value reference')
      ),
    };
  });
  return { type: 'dict', entries };
}

function readCount(bytes, offset, info, limit) {
  if (info < 15) return { count: info, contentOffset: offset };
  requireRange(offset, 1, limit, 'extended length marker');
  const marker = bytes[offset];
  if (marker >> 4 !== 0x1) throw new Error('The bplist extended length is not an integer.');
  const size = 2 ** (marker & 0x0f);
  if (![1, 2, 4, 8].includes(size)) {
    throw new Error('The bplist extended length width is unsupported.');
  }
  return {
    count: readUnsigned(bytes, offset + 1, size, 'extended length'),
    contentOffset: offset + 1 + size,
  };
}

function readUnsigned(bytes, offset, size, label) {
  requireRange(offset, size, bytes.length, label);
  let value = 0n;
  for (let index = 0; index < size; index += 1) {
    value = (value << 8n) | BigInt(bytes[offset + index]);
  }
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`The ${label} is too large to inspect safely.`);
  }
  return Number(value);
}

function requireRange(offset, size, limit, label) {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(size) || offset < 0 || size < 0 ||
    offset > limit || size > limit - offset) {
    throw new Error(`The bplist is truncated while reading ${label}.`);
  }
}

function checkedAdd(first, second) {
  const result = first + second;
  if (!Number.isSafeInteger(result)) {
    throw new Error('The bplist offsets are too large to inspect safely.');
  }
  return result;
}

function checkedMultiply(first, second) {
  const result = first * second;
  if (!Number.isSafeInteger(result)) {
    throw new Error('The bplist size is too large to inspect safely.');
  }
  return result;
}

function isIntegerWidth(size) {
  return Number.isInteger(size) && size >= 1 && size <= 8;
}

function bigintToDisplay(value) {
  return value >= BigInt(Number.MIN_SAFE_INTEGER) && value <= BigInt(Number.MAX_SAFE_INTEGER)
    ? Number(value) : value.toString();
}

function toHex(value) {
  return value.toString(16).padStart(2, '0').toUpperCase();
}
