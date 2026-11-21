const LEAD_SIZE = 96;
const HEADER_PREFIX_SIZE = 16;
const INDEX_ENTRY_SIZE = 16;
const HEADER_MAGIC = 0x8eade801;

const TYPE_NAMES = {
  0: 'Null',
  1: 'Char',
  2: 'Int8',
  3: 'Int16',
  4: 'Int32',
  5: 'Int64',
  6: 'String',
  7: 'Binary',
  8: 'String array',
  9: 'I18N string',
};

const MAIN_TAGS = {
  1000: 'Name',
  1001: 'Version',
  1002: 'Release',
  1004: 'Summary',
  1005: 'Description',
  1021: 'Operating system',
  1022: 'Architecture',
  1124: 'Payload format',
  1125: 'Payload compressor',
  1126: 'Payload flags',
};

class RpmParseError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RpmParseError';
  }
}

/**
 * Ensures a byte range is contained by the RPM buffer.
 *
 * @param {Uint8Array} bytes
 * @param {number} offset
 * @param {number} length
 * @param {string} label
 */
function requireBytes(bytes, offset, length, label) {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0) {
    throw new RpmParseError(`Invalid ${label} offset or length.`);
  }
  if (offset > bytes.length || length > bytes.length - offset) {
    throw new RpmParseError(`The RPM file is truncated while reading ${label}.`);
  }
}

function decodeNullTerminated(bytes, offset, end, label) {
  requireBytes(bytes, offset, 1, label);
  const terminator = bytes.indexOf(0, offset);
  if (terminator === -1 || terminator >= end) {
    throw new RpmParseError(`Missing terminator for ${label}.`);
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(offset, terminator));
  } catch {
    throw new RpmParseError(`Invalid UTF-8 in ${label}.`);
  }
}

function alignToEight(offset) {
  return Math.ceil(offset / 8) * 8;
}

function readLead(bytes) {
  requireBytes(bytes, 0, LEAD_SIZE, 'RPM lead');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, false) !== 0xedabeedb) {
    throw new RpmParseError('This file does not have a valid RPM lead magic value.');
  }

  return {
    major: view.getUint8(4),
    minor: view.getUint8(5),
    packageType: view.getUint16(6, false),
    architecture: view.getUint16(8, false),
    name: decodeNullTerminated(bytes, 10, 76, 'RPM lead package name'),
    operatingSystem: view.getUint16(76, false),
    signatureType: view.getUint16(78, false),
  };
}

function readValue(bytes, dataStart, dataEnd, entry) {
  const valueStart = dataStart + entry.offset;
  if (valueStart < dataStart || valueStart > dataEnd) {
    throw new RpmParseError(`Tag ${entry.tag} points outside its header data store.`);
  }

  if (entry.type === 6 || entry.type === 9) {
    return decodeNullTerminated(bytes, valueStart, dataEnd, `tag ${entry.tag}`);
  }
  if (entry.type === 8) {
    const values = [];
    let currentOffset = valueStart;
    for (let index = 0; index < entry.count; index += 1) {
      const value = decodeNullTerminated(bytes, currentOffset, dataEnd, `tag ${entry.tag}`);
      values.push(value);
      currentOffset += new TextEncoder().encode(value).length + 1;
    }
    return values.join(', ');
  }
  if (entry.type === 1 || entry.type === 2) {
    requireBytes(bytes, valueStart, entry.count, `tag ${entry.tag}`);
    return Array.from(bytes.subarray(valueStart, valueStart + entry.count)).join(', ');
  }
  if (entry.type === 3 || entry.type === 4) {
    const width = entry.type === 3 ? 2 : 4;
    requireBytes(bytes, valueStart, entry.count * width, `tag ${entry.tag}`);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const values = [];
    for (let index = 0; index < entry.count; index += 1) {
      values.push(
        entry.type === 3
          ? view.getUint16(valueStart + index * width, false)
          : view.getUint32(valueStart + index * width, false)
      );
    }
    return values.join(', ');
  }
  return null;
}

function readHeader(bytes, offset, kind) {
  requireBytes(bytes, offset, HEADER_PREFIX_SIZE, `${kind} header`);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(offset, false) !== HEADER_MAGIC) {
    throw new RpmParseError(`Missing or invalid ${kind} header magic.`);
  }

  const entryCount = view.getUint32(offset + 8, false);
  const dataLength = view.getUint32(offset + 12, false);
  const indexStart = offset + HEADER_PREFIX_SIZE;
  const indexLength = entryCount * INDEX_ENTRY_SIZE;
  requireBytes(bytes, indexStart, indexLength, `${kind} header index`);
  const dataStart = indexStart + indexLength;
  requireBytes(bytes, dataStart, dataLength, `${kind} header data`);
  const dataEnd = dataStart + dataLength;
  const tags = [];

  for (let index = 0; index < entryCount; index += 1) {
    const entryOffset = indexStart + index * INDEX_ENTRY_SIZE;
    const entry = {
      tag: view.getUint32(entryOffset, false),
      type: view.getUint32(entryOffset + 4, false),
      offset: view.getUint32(entryOffset + 8, false),
      count: view.getUint32(entryOffset + 12, false),
    };
    const label = kind === 'main' ? MAIN_TAGS[entry.tag] : undefined;
    tags.push({
      ...entry,
      label: label ?? `Tag ${entry.tag}`,
      typeName: TYPE_NAMES[entry.type] ?? `Type ${entry.type}`,
      value: label ? readValue(bytes, dataStart, dataEnd, entry) : null,
    });
  }

  return { nextOffset: dataEnd, entryCount, dataLength, tags };
}

/**
 * Parses RPM lead and header metadata without reading the payload archive.
 *
 * @param {ArrayBuffer|Uint8Array} input
 * @returns {{lead: object, signature: object, header: object, metadata: object}}
 * @throws {RpmParseError} When the file is malformed or truncated.
 */
export function parseRpmHeader(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const lead = readLead(bytes);
  const signature = readHeader(bytes, LEAD_SIZE, 'signature');
  const header = readHeader(bytes, alignToEight(signature.nextOffset), 'main');
  const recognizedTags = header.tags.filter(
    (tag) => MAIN_TAGS[tag.tag] && tag.value !== null
  );
  const metadata = Object.fromEntries(recognizedTags.map((tag) => [tag.label, tag.value]));

  return { lead, signature, header, metadata };
}
