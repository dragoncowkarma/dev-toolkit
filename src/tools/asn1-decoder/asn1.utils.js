const TAG_CLASSES = ['Universal', 'Application', 'Context-specific', 'Private'];

const UNIVERSAL_TAGS = {
  1: 'BOOLEAN',
  2: 'INTEGER',
  3: 'BIT STRING',
  4: 'OCTET STRING',
  5: 'NULL',
  6: 'OBJECT IDENTIFIER',
  12: 'UTF8String',
  16: 'SEQUENCE',
  17: 'SET',
  19: 'PrintableString',
  22: 'IA5String',
  23: 'UTCTime',
  24: 'GeneralizedTime',
};

const WELL_KNOWN_OIDS = {
  '1.2.840.113549.1.1.1': 'rsaEncryption',
  '1.2.840.113549.1.1.5': 'sha1WithRSAEncryption',
  '1.2.840.113549.1.1.11': 'sha256WithRSAEncryption',
  '1.2.840.113549.1.1.12': 'sha384WithRSAEncryption',
  '1.2.840.113549.1.1.13': 'sha512WithRSAEncryption',
  '1.2.840.10045.2.1': 'ecPublicKey',
  '1.2.840.10045.3.1.7': 'prime256v1',
  '1.3.14.3.2.26': 'sha1',
  '2.5.4.3': 'commonName',
  '2.5.4.6': 'countryName',
  '2.5.4.7': 'localityName',
  '2.5.4.10': 'organizationName',
  '2.5.4.11': 'organizationalUnitName',
  '2.5.29.14': 'subjectKeyIdentifier',
  '2.5.29.15': 'keyUsage',
  '2.5.29.17': 'subjectAltName',
  '2.5.29.19': 'basicConstraints',
  '2.5.29.35': 'authorityKeyIdentifier',
};

/**
 * Converts a byte array to a spaced hexadecimal preview.
 *
 * @param {Uint8Array} bytes
 * @param {number} [limit=48]
 * @returns {string}
 */
export function bytesToHex(bytes, limit = 48) {
  const preview = bytes.slice(0, limit);
  const hex = Array.from(preview, (byte) => byte.toString(16).padStart(2, '0')).join(' ');
  return bytes.length > limit ? `${hex} …` : hex;
}

/**
 * Decodes a hexadecimal string into bytes.
 *
 * @param {string} value
 * @returns {Uint8Array}
 * @throws {Error} When the input is not a valid hexadecimal string.
 */
export function decodeHex(value) {
  const cleaned = value.replace(/\s/g, '').replace(/^0x/i, '');
  if (!cleaned) return new Uint8Array();
  if (!/^[\da-f]+$/i.test(cleaned) || cleaned.length % 2 !== 0) {
    throw new Error('Hex input must contain an even number of hexadecimal characters.');
  }
  return Uint8Array.from(cleaned.match(/../g), (pair) => Number.parseInt(pair, 16));
}

/**
 * Decodes a Base64 string into bytes.
 *
 * @param {string} value
 * @returns {Uint8Array}
 * @throws {Error} When the input is not valid Base64.
 */
export function decodeBase64(value) {
  const cleaned = value.replace(/\s/g, '');
  if (!cleaned) return new Uint8Array();
  if (cleaned.length % 4 !== 0 || !/^[A-Za-z\d+/]*={0,2}$/.test(cleaned)) {
    throw new Error('Base64 input is invalid. Check its characters and padding.');
  }
  try {
    return Uint8Array.from(atob(cleaned), (character) => character.charCodeAt(0));
  } catch {
    throw new Error('Base64 input is invalid. Check its characters and padding.');
  }
}

/**
 * Resolves a commonly used object identifier to its friendly name.
 *
 * @param {string} oid
 * @returns {string|undefined}
 */
export function resolveOid(oid) {
  return WELL_KNOWN_OIDS[oid];
}

function parseBase128(bytes, position, end) {
  let value = 0n;
  let cursor = position;
  for (; cursor < end; cursor += 1) {
    const byte = bytes[cursor];
    if (cursor === position && byte === 0x80) {
      throw new Error(`Non-minimal base-128 value at byte ${position}.`);
    }
    value = (value << 7n) | BigInt(byte & 0x7f);
    if ((byte & 0x80) === 0) return { value, next: cursor + 1 };
  }
  throw new Error(`Truncated base-128 value at byte ${position}.`);
}

function parseIdentifier(bytes, offset) {
  if (offset >= bytes.length) throw new Error(`Missing tag at byte ${offset}.`);
  const first = bytes[offset];
  const tagClass = first >> 6;
  const constructed = (first & 0x20) !== 0;
  let tagNumber = BigInt(first & 0x1f);
  let next = offset + 1;
  if (tagNumber === 31n) {
    const parsed = parseBase128(bytes, next, bytes.length);
    if (parsed.value < 31n) throw new Error(`Non-minimal high-tag number at byte ${offset}.`);
    tagNumber = parsed.value;
    next = parsed.next;
  }
  return { tagClass, constructed, tagNumber, next };
}

function parseLength(bytes, offset) {
  if (offset >= bytes.length) throw new Error(`Missing length at byte ${offset}.`);
  const first = bytes[offset];
  if (first < 0x80) return { length: first, next: offset + 1 };
  if (first === 0x80) throw new Error(`Indefinite length is not valid DER at byte ${offset}.`);
  const count = first & 0x7f;
  if (offset + count >= bytes.length) throw new Error(`Truncated length at byte ${offset}.`);
  if (bytes[offset + 1] === 0) throw new Error(`Non-minimal length at byte ${offset}.`);
  let length = 0;
  for (let index = 1; index <= count; index += 1) {
    length = length * 256 + bytes[offset + index];
    if (!Number.isSafeInteger(length)) throw new Error(`Length is too large at byte ${offset}.`);
  }
  if (length < 128) throw new Error(`Non-minimal length at byte ${offset}.`);
  return { length, next: offset + count + 1 };
}

function decodeInteger(bytes) {
  if (bytes.length === 0) throw new Error('INTEGER must contain at least one byte.');
  if (
    bytes.length > 1 &&
    ((bytes[0] === 0 && (bytes[1] & 0x80) === 0) ||
      (bytes[0] === 0xff && (bytes[1] & 0x80) !== 0))
  ) {
    throw new Error('INTEGER is not minimally encoded.');
  }
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) | BigInt(byte);
  if ((bytes[0] & 0x80) !== 0) value -= 1n << BigInt(bytes.length * 8);
  return value.toString();
}

function decodeOid(bytes) {
  if (bytes.length === 0) throw new Error('OBJECT IDENTIFIER must contain at least one byte.');
  const first = parseBase128(bytes, 0, bytes.length);
  const firstValue = first.value;
  const firstArc = firstValue < 40n ? 0n : firstValue < 80n ? 1n : 2n;
  const arcs = [firstArc, firstValue - firstArc * 40n];
  let cursor = first.next;
  while (cursor < bytes.length) {
    const parsed = parseBase128(bytes, cursor, bytes.length);
    arcs.push(parsed.value);
    cursor = parsed.next;
  }
  const oid = arcs.join('.');
  const name = resolveOid(oid);
  return name ? `${oid} (${name})` : oid;
}

function decodeText(bytes, encoding) {
  try {
    return new TextDecoder(encoding, { fatal: true }).decode(bytes);
  } catch {
    return `Invalid text (${bytesToHex(bytes)})`;
  }
}

function decodeAscii(bytes, type) {
  if (bytes.some((byte) => byte > 0x7f)) {
    throw new Error(`${type} must contain only ASCII characters.`);
  }
  return String.fromCharCode(...bytes);
}

function decodePrintableString(bytes) {
  const text = decodeAscii(bytes, 'PrintableString');
  if (!/^[A-Za-z0-9 '()+,\-./:=?]*$/.test(text)) {
    throw new Error('PrintableString contains an invalid character.');
  }
  return text;
}

function validateUniversalForm(tagNumber, constructed) {
  const tag = Number(tagNumber);
  const mustBeConstructed = tag === 16 || tag === 17;
  const mustBePrimitive = [1, 2, 3, 4, 5, 6, 12, 19, 22, 23, 24].includes(tag);
  if (mustBeConstructed && !constructed) {
    throw new Error(`${UNIVERSAL_TAGS[tag]} must use constructed encoding.`);
  }
  if (mustBePrimitive && constructed) {
    throw new Error(`${UNIVERSAL_TAGS[tag]} must use primitive DER encoding.`);
  }
}

function decodePrimitive(tagNumber, bytes) {
  const tag = Number(tagNumber);
  switch (tag) {
    case 1:
      if (bytes.length !== 1) throw new Error('BOOLEAN must be exactly one byte.');
      if (bytes[0] !== 0 && bytes[0] !== 0xff) {
        throw new Error('BOOLEAN must be encoded as 00 or ff in DER.');
      }
      return bytes[0] === 0 ? 'false' : 'true';
    case 2:
      return decodeInteger(bytes);
    case 3:
      if (bytes.length === 0 || bytes[0] > 7) {
        throw new Error('Invalid BIT STRING unused-bits count.');
      }
      if (bytes.length === 1 && bytes[0] !== 0) {
        throw new Error('An empty BIT STRING cannot have unused bits.');
      }
      if (bytes.length > 1 && bytes[0] > 0 && (bytes.at(-1) & ((1 << bytes[0]) - 1)) !== 0) {
        throw new Error('BIT STRING has non-zero unused bits.');
      }
      return (
        `${bytes.length - 1} byte(s), ${bytes[0]} unused bit(s): ` +
        bytesToHex(bytes.slice(1))
      );
    case 4:
      return `${bytes.length} byte(s): ${bytesToHex(bytes)}`;
    case 5:
      if (bytes.length !== 0) throw new Error('NULL must have a zero length.');
      return 'NULL';
    case 6:
      return decodeOid(bytes);
    case 12:
      return decodeText(bytes, 'utf-8');
    case 19:
      return decodePrintableString(bytes);
    case 22:
      return decodeAscii(bytes, 'IA5String');
    case 23:
    case 24:
      return decodeText(bytes, 'ascii');
    default:
      return `${bytes.length} byte(s): ${bytesToHex(bytes)}`;
  }
}

function parseTlv(bytes, offset, limit) {
  const identifier = parseIdentifier(bytes, offset);
  const lengthInfo = parseLength(bytes, identifier.next);
  const valueEnd = lengthInfo.next + lengthInfo.length;
  if (valueEnd > limit) {
    throw new Error(`Value at byte ${offset} is truncated (needs ${lengthInfo.length} byte(s)).`);
  }
  const value = bytes.slice(lengthInfo.next, valueEnd);
  const universalName =
    identifier.tagClass === 0 ? UNIVERSAL_TAGS[identifier.tagNumber] : undefined;
  if (identifier.tagClass === 0) {
    validateUniversalForm(identifier.tagNumber, identifier.constructed);
  }
  const node = {
    offset,
    tagClass: TAG_CLASSES[identifier.tagClass],
    tagNumber: identifier.tagNumber.toString(),
    tagName: universalName ?? 'Unknown',
    constructed: identifier.constructed,
    length: lengthInfo.length,
    value: '',
    children: [],
  };

  if (identifier.constructed) {
    let childOffset = lengthInfo.next;
    while (childOffset < valueEnd) {
      const child = parseTlv(bytes, childOffset, valueEnd);
      node.children.push(child.node);
      childOffset = child.next;
    }
    node.value = `${node.children.length} child node(s)`;
  } else {
    node.value = decodePrimitive(identifier.tagNumber, value);
  }
  return { node, next: valueEnd };
}

/**
 * Parses one or more ASN.1 DER TLV values into display-ready tree nodes.
 *
 * @param {Uint8Array} bytes
 * @returns {Array<object>}
 * @throws {Error} When the DER input is malformed or truncated.
 */
export function parseDer(bytes) {
  if (!(bytes instanceof Uint8Array)) throw new TypeError('DER input must be bytes.');
  if (bytes.length === 0) throw new Error('Provide DER data to inspect.');
  const nodes = [];
  let offset = 0;
  while (offset < bytes.length) {
    const parsed = parseTlv(bytes, offset, bytes.length);
    nodes.push(parsed.node);
    offset = parsed.next;
  }
  return nodes;
}

/**
 * Reads raw bytes from an uploaded browser file.
 *
 * @param {File|Blob} file
 * @returns {Promise<Uint8Array>}
 */
export async function readFileBytes(file) {
  return new Uint8Array(await file.arrayBuffer());
}
