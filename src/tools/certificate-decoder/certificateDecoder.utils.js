/**
 * Dependency-free PEM/X.509 certificate decoder.
 *
 * The module implements just enough of DER/ASN.1 (BER's canonical subset) to
 * walk an X.509 `Certificate` structure by hand. No `node-forge`, `pkijs`, or
 * other ASN.1 package is used, and nothing here touches the network: the input
 * is Base64-decoded and inspected entirely in the caller's process.
 */

/** ASN.1 identifier-octet class bits. */
export const ASN1_CLASS = {
  UNIVERSAL: 0x00,
  APPLICATION: 0x40,
  CONTEXT: 0x80,
  PRIVATE: 0xc0,
};

/** Universal ASN.1 tag numbers used by X.509 certificates. */
export const ASN1_TAG = {
  BOOLEAN: 0x01,
  INTEGER: 0x02,
  BIT_STRING: 0x03,
  OCTET_STRING: 0x04,
  NULL: 0x05,
  OBJECT_IDENTIFIER: 0x06,
  UTF8_STRING: 0x0c,
  SEQUENCE: 0x10,
  SET: 0x11,
  PRINTABLE_STRING: 0x13,
  T61_STRING: 0x14,
  IA5_STRING: 0x16,
  UTC_TIME: 0x17,
  GENERALIZED_TIME: 0x18,
  UNIVERSAL_STRING: 0x1c,
  BMP_STRING: 0x1e,
};

const TAG_LABELS = {
  [ASN1_TAG.BOOLEAN]: 'BOOLEAN',
  [ASN1_TAG.INTEGER]: 'INTEGER',
  [ASN1_TAG.BIT_STRING]: 'BIT STRING',
  [ASN1_TAG.OCTET_STRING]: 'OCTET STRING',
  [ASN1_TAG.OBJECT_IDENTIFIER]: 'OBJECT IDENTIFIER',
  [ASN1_TAG.SEQUENCE]: 'SEQUENCE',
  [ASN1_TAG.SET]: 'SET',
};

/** Guards against stack exhaustion from deliberately over-nested input. */
const MAX_ASN1_DEPTH = 40;

const PEM_BLOCK_PATTERN = /-----BEGIN ([^-]+)-----([\s\S]*?)-----END \1-----/g;
const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;
const CERTIFICATE_LABELS = new Set(['CERTIFICATE', 'X509 CERTIFICATE', 'TRUSTED CERTIFICATE']);

const OID = {
  RSA_ENCRYPTION: '1.2.840.113549.1.1.1',
  RSASSA_PSS: '1.2.840.113549.1.1.10',
  EC_PUBLIC_KEY: '1.2.840.10045.2.1',
  DSA: '1.2.840.10040.4.1',
  ED25519: '1.3.101.112',
  ED448: '1.3.101.113',
  SUBJECT_ALT_NAME: '2.5.29.17',
  BASIC_CONSTRAINTS: '2.5.29.19',
};

/** Distinguished-name attribute types, keyed by OID. */
const DN_ATTRIBUTES = {
  '2.5.4.3': { shortName: 'CN', name: 'commonName' },
  '2.5.4.4': { shortName: 'SN', name: 'surname' },
  '2.5.4.5': { shortName: 'serialNumber', name: 'serialNumber' },
  '2.5.4.6': { shortName: 'C', name: 'countryName' },
  '2.5.4.7': { shortName: 'L', name: 'localityName' },
  '2.5.4.8': { shortName: 'ST', name: 'stateOrProvinceName' },
  '2.5.4.9': { shortName: 'STREET', name: 'streetAddress' },
  '2.5.4.10': { shortName: 'O', name: 'organizationName' },
  '2.5.4.11': { shortName: 'OU', name: 'organizationalUnitName' },
  '2.5.4.12': { shortName: 'T', name: 'title' },
  '2.5.4.15': { shortName: 'businessCategory', name: 'businessCategory' },
  '2.5.4.17': { shortName: 'postalCode', name: 'postalCode' },
  '2.5.4.42': { shortName: 'GN', name: 'givenName' },
  '2.5.4.97': { shortName: 'organizationIdentifier', name: 'organizationIdentifier' },
  '1.2.840.113549.1.9.1': { shortName: 'E', name: 'emailAddress' },
  '0.9.2342.19200300.100.1.1': { shortName: 'UID', name: 'userId' },
  '0.9.2342.19200300.100.1.25': { shortName: 'DC', name: 'domainComponent' },
  '1.3.6.1.4.1.311.60.2.1.3': { shortName: 'jurisdictionC', name: 'jurisdictionCountryName' },
};

/** Signature algorithm OIDs resolved to their conventional names. */
const SIGNATURE_ALGORITHMS = {
  '1.2.840.113549.1.1.2': 'md2WithRSAEncryption',
  '1.2.840.113549.1.1.4': 'md5WithRSAEncryption',
  '1.2.840.113549.1.1.5': 'sha1WithRSAEncryption',
  '1.2.840.113549.1.1.10': 'RSASSA-PSS',
  '1.2.840.113549.1.1.11': 'sha256WithRSAEncryption',
  '1.2.840.113549.1.1.12': 'sha384WithRSAEncryption',
  '1.2.840.113549.1.1.13': 'sha512WithRSAEncryption',
  '1.2.840.113549.1.1.14': 'sha224WithRSAEncryption',
  '1.2.840.10040.4.3': 'dsa-with-sha1',
  '2.16.840.1.101.3.4.3.2': 'dsa-with-sha256',
  '1.2.840.10045.4.1': 'ecdsa-with-SHA1',
  '1.2.840.10045.4.3.1': 'ecdsa-with-SHA224',
  '1.2.840.10045.4.3.2': 'ecdsa-with-SHA256',
  '1.2.840.10045.4.3.3': 'ecdsa-with-SHA384',
  '1.2.840.10045.4.3.4': 'ecdsa-with-SHA512',
  '1.3.101.112': 'Ed25519',
  '1.3.101.113': 'Ed448',
};

/** Public key algorithm OIDs resolved to display labels. */
const PUBLIC_KEY_ALGORITHMS = {
  [OID.RSA_ENCRYPTION]: 'RSA',
  [OID.RSASSA_PSS]: 'RSASSA-PSS',
  [OID.EC_PUBLIC_KEY]: 'EC',
  [OID.DSA]: 'DSA',
  [OID.ED25519]: 'Ed25519',
  [OID.ED448]: 'Ed448',
};

/** Named elliptic curves, with the key size implied by each curve. */
const EC_CURVES = {
  '1.2.840.10045.3.1.1': { name: 'prime192v1 (P-192)', keySize: 192 },
  '1.2.840.10045.3.1.7': { name: 'prime256v1 (P-256)', keySize: 256 },
  '1.3.132.0.33': { name: 'secp224r1 (P-224)', keySize: 224 },
  '1.3.132.0.34': { name: 'secp384r1 (P-384)', keySize: 384 },
  '1.3.132.0.35': { name: 'secp521r1 (P-521)', keySize: 521 },
  '1.3.132.0.10': { name: 'secp256k1', keySize: 256 },
};

/** Certificate extension OIDs resolved to their RFC 5280 names. */
const EXTENSION_NAMES = {
  '2.5.29.9': 'subjectDirectoryAttributes',
  '2.5.29.14': 'subjectKeyIdentifier',
  '2.5.29.15': 'keyUsage',
  '2.5.29.16': 'privateKeyUsagePeriod',
  '2.5.29.17': 'subjectAltName',
  '2.5.29.18': 'issuerAltName',
  '2.5.29.19': 'basicConstraints',
  '2.5.29.30': 'nameConstraints',
  '2.5.29.31': 'cRLDistributionPoints',
  '2.5.29.32': 'certificatePolicies',
  '2.5.29.35': 'authorityKeyIdentifier',
  '2.5.29.36': 'policyConstraints',
  '2.5.29.37': 'extKeyUsage',
  '2.5.29.54': 'inhibitAnyPolicy',
  '1.3.6.1.5.5.7.1.1': 'authorityInfoAccess',
  '1.3.6.1.4.1.11129.2.4.2': 'signedCertificateTimestampList',
};

/** `GeneralName` CHOICE indices from RFC 5280, mapped to display labels. */
const GENERAL_NAME_LABELS = {
  0: 'Other',
  1: 'Email',
  2: 'DNS',
  3: 'X400',
  4: 'Directory',
  5: 'EDI',
  6: 'URI',
  7: 'IP',
  8: 'Registered ID',
};

/**
 * Formats bytes as uppercase hexadecimal.
 *
 * @param {Uint8Array} bytes Bytes to render.
 * @param {string} [separator] Optional separator inserted between octets.
 * @returns {string} Uppercase hexadecimal text.
 */
export function toHex(bytes, separator = '') {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0').toUpperCase())
    .join(separator);
}

/**
 * Inserts a separator between every pair of hexadecimal characters for display.
 *
 * @param {string} hex Continuous hexadecimal text.
 * @param {string} [separator] Separator to insert.
 * @returns {string} Grouped hexadecimal text.
 */
export function formatHexGroups(hex, separator = ':') {
  return (hex.match(/.{1,2}/g) ?? []).join(separator);
}

function decodeLatin1(bytes) {
  let text = '';
  for (const byte of bytes) {
    text += String.fromCharCode(byte);
  }
  return text;
}

/**
 * Extracts every PEM block from arbitrary text, preserving document order.
 *
 * @param {string} text Text that may contain PEM armour.
 * @returns {Array<{label: string, body: string}>} Block labels with whitespace-stripped bodies.
 */
export function extractPemBlocks(text) {
  if (typeof text !== 'string') return [];
  return Array.from(text.matchAll(PEM_BLOCK_PATTERN), (match) => ({
    label: match[1].trim(),
    body: match[2].replace(/\s+/g, ''),
  }));
}

/**
 * Decodes standard (non-URL-safe) Base64 text into bytes.
 *
 * @param {string} base64 Base64 text, optionally containing whitespace.
 * @returns {Uint8Array} Decoded bytes.
 * @throws {Error} When the text is not well-formed Base64.
 */
export function decodeBase64ToBytes(base64) {
  const compact = String(base64).replace(/\s+/g, '');
  if (compact.length === 0 || compact.length % 4 !== 0 || !BASE64_PATTERN.test(compact)) {
    throw new Error('The certificate body is not valid Base64 data.');
  }

  try {
    return Uint8Array.from(atob(compact), (character) => character.charCodeAt(0));
  } catch {
    throw new Error('The certificate body is not valid Base64 data.');
  }
}

function readTlvHeader(bytes, offset, limit) {
  if (offset >= limit) {
    throw new Error('Unexpected end of DER data.');
  }

  const identifier = bytes[offset];
  const tagClass = identifier & 0xc0;
  const constructed = (identifier & 0x20) !== 0;
  let tagNumber = identifier & 0x1f;
  let cursor = offset + 1;

  if (tagNumber === 0x1f) {
    tagNumber = 0;
    let byte;
    do {
      if (cursor >= limit) throw new Error('A DER tag is truncated.');
      byte = bytes[cursor];
      cursor += 1;
      tagNumber = tagNumber * 128 + (byte & 0x7f);
      if (!Number.isSafeInteger(tagNumber)) {
        throw new Error('A DER tag number is too large to decode.');
      }
    } while ((byte & 0x80) !== 0);
  }

  if (cursor >= limit) throw new Error('A DER length octet is missing.');
  const firstLengthByte = bytes[cursor];
  cursor += 1;
  let length = firstLengthByte;

  if (firstLengthByte >= 0x80) {
    const lengthByteCount = firstLengthByte & 0x7f;
    if (lengthByteCount === 0) {
      throw new Error('Indefinite DER lengths are not allowed in certificates.');
    }
    if (lengthByteCount > 4) {
      throw new Error('A DER element declares an unsupported length.');
    }
    length = 0;
    for (let index = 0; index < lengthByteCount; index += 1) {
      if (cursor >= limit) throw new Error('A DER length is truncated.');
      length = length * 256 + bytes[cursor];
      cursor += 1;
    }
  }

  const contentEnd = cursor + length;
  if (contentEnd > limit) {
    throw new Error('A DER element declares more data than the input contains.');
  }

  return { tagClass, tagNumber, constructed, contentStart: cursor, contentEnd };
}

function parseAsn1Nodes(bytes, start, limit, depth) {
  if (depth > MAX_ASN1_DEPTH) {
    throw new Error('The DER structure is nested too deeply to decode.');
  }

  const nodes = [];
  let cursor = start;

  while (cursor < limit) {
    const header = readTlvHeader(bytes, cursor, limit);
    const node = {
      tagClass: header.tagClass,
      tagNumber: header.tagNumber,
      constructed: header.constructed,
      start: cursor,
      end: header.contentEnd,
      // The complete TLV encoding, kept so structures RFC 5280 requires to be
      // identical can be compared as DER rather than field by field.
      raw: bytes.subarray(cursor, header.contentEnd),
      content: bytes.subarray(header.contentStart, header.contentEnd),
      children: null,
    };

    if (header.constructed) {
      node.children = parseAsn1Nodes(bytes, header.contentStart, header.contentEnd, depth + 1);
    }

    nodes.push(node);
    cursor = header.contentEnd;
  }

  return nodes;
}

/**
 * Parses a DER byte string that must contain exactly one top-level element.
 *
 * @param {Uint8Array} bytes DER-encoded bytes.
 * @returns {object} The parsed ASN.1 node tree.
 * @throws {Error} When the bytes are not a single well-formed DER element.
 */
export function parseAsn1(bytes) {
  const nodes = parseAsn1Nodes(bytes, 0, bytes.length, 0);
  if (nodes.length === 0) {
    throw new Error('The DER data is empty.');
  }
  if (nodes.length > 1) {
    throw new Error('The DER data contains unexpected trailing bytes.');
  }
  return nodes[0];
}

// DER fixes the encoding form of every universal tag: SEQUENCE and SET are
// always constructed, every other tag this decoder reads is always primitive.
const CONSTRUCTED_UNIVERSAL_TAGS = new Set([ASN1_TAG.SEQUENCE, ASN1_TAG.SET]);

function isUniversal(node, tagNumber) {
  return (
    Boolean(node) &&
    node.tagClass === ASN1_CLASS.UNIVERSAL &&
    node.tagNumber === tagNumber &&
    node.constructed === CONSTRUCTED_UNIVERSAL_TAGS.has(tagNumber)
  );
}

function isContext(node, tagNumber) {
  return Boolean(node) && node.tagClass === ASN1_CLASS.CONTEXT && node.tagNumber === tagNumber;
}

function expectUniversal(node, tagNumber, label) {
  if (!isUniversal(node, tagNumber)) {
    throw new Error(`${label} is not a valid DER ${TAG_LABELS[tagNumber] ?? 'element'}.`);
  }
  return node;
}

/**
 * Decodes an OBJECT IDENTIFIER's content octets into dotted-decimal form.
 *
 * @param {Uint8Array} content Content octets of the OID element.
 * @returns {string} Dotted-decimal OID.
 * @throws {Error} When the encoding is truncated or an arc is unrepresentable.
 */
export function decodeOid(content) {
  if (content.length === 0) {
    throw new Error('An OBJECT IDENTIFIER element is empty.');
  }

  const subIdentifiers = [];
  let value = 0;
  let pending = false;

  for (const byte of content) {
    value = value * 128 + (byte & 0x7f);
    pending = true;
    if (!Number.isSafeInteger(value)) {
      throw new Error('An OBJECT IDENTIFIER arc is too large to decode.');
    }
    if ((byte & 0x80) === 0) {
      subIdentifiers.push(value);
      value = 0;
      pending = false;
    }
  }

  if (pending) {
    throw new Error('An OBJECT IDENTIFIER element is truncated.');
  }

  const [first, ...rest] = subIdentifiers;
  const firstArc = Math.min(Math.floor(first / 40), 2);
  return [firstArc, first - firstArc * 40, ...rest].join('.');
}

function readOid(node, label) {
  expectUniversal(node, ASN1_TAG.OBJECT_IDENTIFIER, label);
  return decodeOid(node.content);
}

function decodeUtf16BeString(content) {
  if (content.length % 2 !== 0) {
    throw new Error('A BMPString element has an odd byte length.');
  }
  let text = '';
  for (let index = 0; index < content.length; index += 2) {
    text += String.fromCharCode((content[index] << 8) | content[index + 1]);
  }
  return text;
}

function decodeUtf32BeString(content) {
  if (content.length % 4 !== 0) {
    throw new Error('A UniversalString element has an invalid byte length.');
  }
  let text = '';
  for (let index = 0; index < content.length; index += 4) {
    const codePoint =
      content[index] * 0x1000000 +
      content[index + 1] * 0x10000 +
      content[index + 2] * 0x100 +
      content[index + 3];
    if (codePoint > 0x10ffff) {
      throw new Error('A UniversalString element contains an invalid code point.');
    }
    text += String.fromCodePoint(codePoint);
  }
  return text;
}

/**
 * Decodes any ASN.1 string element into a JavaScript string.
 *
 * @param {object} node ASN.1 node holding string content.
 * @returns {string} The decoded text.
 */
export function decodeAsn1String(node) {
  switch (node.tagNumber) {
    case ASN1_TAG.UTF8_STRING:
      return new TextDecoder('utf-8').decode(node.content);
    case ASN1_TAG.BMP_STRING:
      return decodeUtf16BeString(node.content);
    case ASN1_TAG.UNIVERSAL_STRING:
      return decodeUtf32BeString(node.content);
    default:
      return decodeLatin1(node.content);
  }
}

const UTC_TIME_PATTERN = /^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?(Z|[+-]\d{4})$/;
const GENERALIZED_TIME_PATTERN =
  /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?(?:[.,](\d+))?(Z|[+-]\d{4})$/;

const DAYS_PER_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function getDaysInMonth(year, month) {
  return month === 2 && isLeapYear(year) ? 29 : DAYS_PER_MONTH[month - 1];
}

function applyZoneOffset(utcMilliseconds, zoneSign, zoneHours, zoneMinutes) {
  return utcMilliseconds - zoneSign * (zoneHours * 60 + zoneMinutes) * 60_000;
}

/**
 * Builds a UTC timestamp without the normalisation `Date.UTC()` applies to
 * years below 100, which it would otherwise remap into the 1900s.
 */
function toUtcMilliseconds(year, month, day, hour, minute, second, millisecond) {
  const timestamp = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);
  if (year >= 0 && year <= 99) {
    const literalYear = new Date(timestamp);
    literalYear.setUTCFullYear(year);
    return literalYear.getTime();
  }
  return timestamp;
}

/**
 * Decodes a UTCTime or GeneralizedTime element into a `Date` plus its raw form.
 *
 * @param {object} node ASN.1 time node.
 * @returns {{raw: string, utc: string, date: Date}} Raw text, ISO UTC text, and the date.
 * @throws {Error} When the element is not a supported ASN.1 time value.
 */
export function decodeAsn1Time(node) {
  const raw = decodeLatin1(node.content);
  const isUtcTime = isUniversal(node, ASN1_TAG.UTC_TIME);
  const isGeneralizedTime = isUniversal(node, ASN1_TAG.GENERALIZED_TIME);

  if (!isUtcTime && !isGeneralizedTime) {
    throw new Error('A certificate validity field is not an ASN.1 time value.');
  }

  const match = raw.match(isUtcTime ? UTC_TIME_PATTERN : GENERALIZED_TIME_PATTERN);
  if (!match) {
    throw new Error(`"${raw}" is not a supported ASN.1 time value.`);
  }

  // RFC 5280: two-digit years below 50 belong to the 2000s, the rest to the 1900s.
  const year = isUtcTime
    ? Number(match[1]) + (Number(match[1]) < 50 ? 2000 : 1900)
    : Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6] ?? 0);
  const fraction = isGeneralizedTime && match[7] ? Number(`0.${match[7]}`) * 1000 : 0;
  const zone = isUtcTime ? match[7] : match[8];
  const zoneSign = zone === 'Z' || zone[0] === '+' ? 1 : -1;
  const zoneHours = zone === 'Z' ? 0 : Number(zone.slice(1, 3));
  const zoneMinutes = zone === 'Z' ? 0 : Number(zone.slice(3, 5));

  // `Date.UTC()` silently normalises out-of-range fields, so month 13 would
  // otherwise be presented as January of the following year. Every calendar and
  // offset component is range-checked against the raw text before the `Date`
  // is built, so corrupt validity data is rejected rather than rewritten.
  const isOutOfRange =
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > getDaysInMonth(year, month) ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    zoneHours > 23 ||
    zoneMinutes > 59;
  if (isOutOfRange) {
    throw new Error(`"${raw}" is not a valid ASN.1 time value.`);
  }

  const milliseconds = applyZoneOffset(
    toUtcMilliseconds(year, month, day, hour, minute, second, Math.min(999, Math.round(fraction))),
    zoneSign,
    zoneHours,
    zoneMinutes,
  );

  const date = new Date(milliseconds);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`"${raw}" is not a valid ASN.1 time value.`);
  }

  return { raw, utc: formatUtc(date), date };
}

/**
 * Formats a date as a second-precision UTC timestamp.
 *
 * @param {Date} date Date to format.
 * @returns {string} `YYYY-MM-DDTHH:MM:SSZ` text.
 */
export function formatUtc(date) {
  return `${date.toISOString().slice(0, 19)}Z`;
}

function decodeSmallInteger(node, label) {
  expectUniversal(node, ASN1_TAG.INTEGER, label);
  if (node.content.length === 0 || node.content.length > 4) {
    throw new Error(`${label} is not a small DER INTEGER.`);
  }
  let value = 0;
  for (const byte of node.content) {
    value = value * 256 + byte;
  }
  if ((node.content[0] & 0x80) !== 0) {
    value -= 2 ** (8 * node.content.length);
  }
  return value;
}

function decodeAsn1Boolean(node, label) {
  if (node.content.length !== 1) {
    throw new Error(`${label} is not a valid DER BOOLEAN.`);
  }
  return node.content[0] !== 0;
}

/**
 * Counts the significant bits of a big-endian unsigned integer.
 *
 * @param {Uint8Array} content Big-endian bytes, possibly zero-padded.
 * @returns {number} Number of significant bits (0 for a zero value).
 */
export function getIntegerBitLength(content) {
  let index = 0;
  while (index < content.length && content[index] === 0) {
    index += 1;
  }
  if (index === content.length) return 0;
  return (content.length - index - 1) * 8 + (32 - Math.clz32(content[index]));
}

function readBitStringBytes(node, label) {
  expectUniversal(node, ASN1_TAG.BIT_STRING, label);
  if (node.content.length === 0) {
    throw new Error(`${label} is an empty BIT STRING.`);
  }
  const unusedBitCount = node.content[0];
  if (unusedBitCount > 7) {
    throw new Error(`${label} declares an invalid unused-bit count.`);
  }
  const bits = node.content.subarray(1);
  // X.690 §11.2 pins down the two remaining degrees of freedom DER removes from
  // BER: a BIT STRING with no content octets must declare zero unused bits, and
  // the bits the final octet declares unused must themselves be zero. Without
  // both checks the same bit string has several encodings, so a value could be
  // altered without changing what it decodes to.
  if (bits.length === 0) {
    if (unusedBitCount !== 0) {
      throw new Error(`${label} declares unused bits but carries no content octets.`);
    }
    return bits;
  }
  if ((bits[bits.length - 1] & ((1 << unusedBitCount) - 1)) !== 0) {
    throw new Error(`${label} declares unused bits that are not zero.`);
  }
  return bits;
}

function formatDistinguishedName(fields) {
  return fields.map((field) => `${field.shortName}=${field.value}`).join(', ');
}

/**
 * Parses an X.501 `Name` (a sequence of relative distinguished names).
 *
 * @param {object} node ASN.1 node for the Name.
 * @param {string} label Human-readable label used in error messages.
 * @returns {object} Parsed attribute list plus common convenience accessors.
 * @throws {Error} When the structure does not match `Name`.
 */
export function parseName(node, label = 'A distinguished name') {
  expectUniversal(node, ASN1_TAG.SEQUENCE, label);
  const fields = [];

  for (const rdn of node.children) {
    expectUniversal(rdn, ASN1_TAG.SET, `${label} component`);
    for (const attribute of rdn.children) {
      expectUniversal(attribute, ASN1_TAG.SEQUENCE, `${label} attribute`);
      if (!attribute.children || attribute.children.length < 2) {
        throw new Error(`${label} attribute is missing its type or value.`);
      }
      const oid = readOid(attribute.children[0], `${label} attribute type`);
      const valueNode = attribute.children[1];
      const descriptor = DN_ATTRIBUTES[oid];
      fields.push({
        oid,
        shortName: descriptor?.shortName ?? oid,
        name: descriptor?.name ?? oid,
        value: valueNode.constructed ? toHex(valueNode.content) : decodeAsn1String(valueNode),
      });
    }
  }

  const valueOf = (shortName) =>
    fields.find((field) => field.shortName === shortName)?.value ?? null;

  return {
    fields,
    text: formatDistinguishedName(fields),
    commonName: valueOf('CN'),
    organization: valueOf('O'),
    organizationalUnit: valueOf('OU'),
    country: valueOf('C'),
    state: valueOf('ST'),
    locality: valueOf('L'),
  };
}

function parseAlgorithmIdentifier(node, label) {
  expectUniversal(node, ASN1_TAG.SEQUENCE, label);
  if (!node.children || node.children.length === 0) {
    throw new Error(`${label} is missing its algorithm OID.`);
  }
  // RFC 5280 §4.1.1.2 defines AlgorithmIdentifier as an OID followed by at most
  // one optional `parameters` value. Surplus fields make the structure something
  // other than an AlgorithmIdentifier even when its OID still reads back, so
  // they are rejected here rather than silently ignored: otherwise two equally
  // malformed identifiers would pass the DER equality check below.
  if (node.children.length > 2) {
    throw new Error(`${label} has unexpected fields after its parameters.`);
  }
  const oid = readOid(node.children[0], `${label} OID`);
  return {
    oid,
    name: SIGNATURE_ALGORITHMS[oid] ?? PUBLIC_KEY_ALGORITHMS[oid] ?? null,
    parameters: node.children[1] ?? null,
    der: node.raw,
  };
}

/** Compares two DER encodings byte for byte. */
function derEquals(left, right) {
  if (!left || !right || left.length !== right.length) return false;
  return left.every((byte, index) => byte === right[index]);
}

/** Drops the raw `parameters` and `der` values so the result stays serialisable. */
function toAlgorithmSummary(algorithm) {
  return { oid: algorithm.oid, name: algorithm.name };
}

function readRsaModulusBits(keyBytes) {
  try {
    const rsaKey = parseAsn1(keyBytes);
    expectUniversal(rsaKey, ASN1_TAG.SEQUENCE, 'An RSA public key');
    const modulus = expectUniversal(rsaKey.children[0], ASN1_TAG.INTEGER, 'An RSA modulus');
    const bits = getIntegerBitLength(modulus.content);
    return bits > 0 ? bits : null;
  } catch {
    // A key body we cannot read is reported as "unknown size" rather than
    // failing the whole certificate: every other field stays inspectable.
    return null;
  }
}

function parsePublicKeyInfo(node) {
  expectUniversal(node, ASN1_TAG.SEQUENCE, 'The subject public key info');
  // RFC 5280 §4.1 defines SubjectPublicKeyInfo as exactly an AlgorithmIdentifier
  // followed by the key BIT STRING, so surplus fields are rejected rather than
  // skipped past.
  if (node.children.length !== 2) {
    throw new Error('The subject public key info does not hold exactly two fields.');
  }
  const algorithm = parseAlgorithmIdentifier(node.children[0], 'The public key algorithm');
  const keyBytes = readBitStringBytes(node.children[1], 'The subject public key');

  const info = {
    algorithmOid: algorithm.oid,
    algorithm: PUBLIC_KEY_ALGORITHMS[algorithm.oid] ?? algorithm.oid,
    keySize: null,
    curve: null,
    curveOid: null,
  };

  if (algorithm.oid === OID.RSA_ENCRYPTION || algorithm.oid === OID.RSASSA_PSS) {
    info.keySize = readRsaModulusBits(keyBytes);
  } else if (algorithm.oid === OID.EC_PUBLIC_KEY) {
    if (isUniversal(algorithm.parameters, ASN1_TAG.OBJECT_IDENTIFIER)) {
      info.curveOid = decodeOid(algorithm.parameters.content);
      const curve = EC_CURVES[info.curveOid];
      info.curve = curve?.name ?? info.curveOid;
      info.keySize = curve?.keySize ?? null;
    }
  } else if (algorithm.oid === OID.ED25519) {
    info.keySize = 256;
  } else if (algorithm.oid === OID.ED448) {
    info.keySize = 456;
  }

  return info;
}

function formatIpAddress(content) {
  if (content.length === 4) {
    return Array.from(content).join('.');
  }
  if (content.length === 16) {
    const groups = [];
    for (let index = 0; index < 16; index += 2) {
      groups.push(((content[index] << 8) | content[index + 1]).toString(16));
    }
    return groups.join(':');
  }
  return toHex(content, ':');
}

function parseGeneralName(node) {
  if (node.tagClass !== ASN1_CLASS.CONTEXT) {
    return { type: 'Unknown', value: toHex(node.content, ':') };
  }

  const type = GENERAL_NAME_LABELS[node.tagNumber] ?? `[${node.tagNumber}]`;

  switch (node.tagNumber) {
    case 1:
    case 2:
    case 6:
      return { type, value: decodeLatin1(node.content) };
    case 7:
      return { type, value: formatIpAddress(node.content) };
    case 8:
      return { type, value: decodeOid(node.content) };
    case 4:
      return { type, value: parseName(node.children[0], 'A directory name').text };
    default:
      return { type, value: toHex(node.content, ':') };
  }
}

function parseSubjectAltNames(content) {
  const names = parseAsn1(content);
  expectUniversal(names, ASN1_TAG.SEQUENCE, 'The subjectAltName extension');
  return names.children.map(parseGeneralName);
}

function parseBasicConstraints(content) {
  const constraints = parseAsn1(content);
  expectUniversal(constraints, ASN1_TAG.SEQUENCE, 'The basicConstraints extension');
  let isCa = false;
  let pathLength = null;

  for (const child of constraints.children) {
    if (isUniversal(child, ASN1_TAG.BOOLEAN)) {
      isCa = decodeAsn1Boolean(child, 'The basicConstraints CA flag');
    } else if (isUniversal(child, ASN1_TAG.INTEGER)) {
      pathLength = decodeSmallInteger(child, 'The basicConstraints path length');
    }
  }

  return { isCa, pathLength };
}

function parseExtensions(node) {
  expectUniversal(node, ASN1_TAG.SEQUENCE, 'The certificate extensions');
  const all = [];
  let subjectAltNames = [];
  let basicConstraints = null;

  for (const extension of node.children) {
    expectUniversal(extension, ASN1_TAG.SEQUENCE, 'A certificate extension');
    const oid = readOid(extension.children[0], 'A certificate extension identifier');
    let cursor = 1;
    let critical = false;

    if (isUniversal(extension.children[cursor], ASN1_TAG.BOOLEAN)) {
      critical = decodeAsn1Boolean(extension.children[cursor], `Extension ${oid} criticality`);
      cursor += 1;
    }

    const valueNode = extension.children[cursor];
    expectUniversal(valueNode, ASN1_TAG.OCTET_STRING, `Extension ${oid} value`);
    all.push({ oid, name: EXTENSION_NAMES[oid] ?? null, critical });

    if (oid === OID.SUBJECT_ALT_NAME) {
      subjectAltNames = parseSubjectAltNames(valueNode.content);
    } else if (oid === OID.BASIC_CONSTRAINTS) {
      basicConstraints = parseBasicConstraints(valueNode.content);
    }
  }

  return { all, subjectAltNames, basicConstraints };
}

/**
 * Reads the optional tail `TBSCertificate` allows after `subjectPublicKeyInfo`.
 *
 * RFC 5280 §4.1 admits exactly three optional fields there — `[1]
 * issuerUniqueID`, `[2] subjectUniqueID`, and `[3] extensions` — each at most
 * once and in ascending tag order. Scanning for the `[3]` wrapper and ignoring
 * whatever else is present would let arbitrary extra fields ride along inside a
 * body that still decodes, so every field is checked against that grammar and
 * anything unknown, duplicated, out of order, or trailing is rejected.
 *
 * The first two are IMPLICIT `UniqueIdentifier` (a BIT STRING, hence primitive
 * in DER); `[3]` is EXPLICIT and so wraps exactly one element, its `Extensions`
 * SEQUENCE.
 *
 * @param {Array<object>} fields The tbsCertificate fields after the public key.
 * @returns {object|null} The `[3]` extensions wrapper, or null when absent.
 * @throws {Error} When the tail does not match the RFC 5280 grammar.
 */
function readTbsOptionalFields(fields) {
  let lowestAllowedTag = 1;
  let extensionsNode = null;

  for (const field of fields) {
    const isAllowedTag =
      field.tagClass === ASN1_CLASS.CONTEXT &&
      field.tagNumber >= lowestAllowedTag &&
      field.tagNumber <= 3 &&
      field.constructed === (field.tagNumber === 3);
    if (!isAllowedTag) {
      throw new Error('The certificate body has an unexpected field after its public key.');
    }
    lowestAllowedTag = field.tagNumber + 1;
    if (field.tagNumber === 3) {
      if (field.children.length !== 1) {
        throw new Error('The certificate extensions wrapper does not hold exactly one element.');
      }
      extensionsNode = field;
    }
  }

  return extensionsNode;
}

/**
 * Decodes a DER-encoded X.509 certificate into a plain inspection object.
 *
 * The decoder never verifies signatures, so `subjectMatchesIssuer` only reports
 * distinguished-name equality. A matching pair means the certificate is
 * self-issued; proving it is self-signed requires checking the signature
 * against the subject public key.
 *
 * @param {Uint8Array} der DER bytes of a single `Certificate` structure.
 * @returns {object} Version, serial, issuer, subject, validity, key, and extension details.
 * @throws {Error} When the DER structure does not describe an X.509 certificate.
 */
export function parseCertificate(der) {
  const certificate = parseAsn1(der);
  expectUniversal(certificate, ASN1_TAG.SEQUENCE, 'The certificate');
  // RFC 5280 defines Certificate as exactly { tbsCertificate,
  // signatureAlgorithm, signatureValue }, so anything else is not an X.509
  // certificate even when its first fields happen to decode.
  if (certificate.children.length < 3) {
    throw new Error('The certificate is missing its signature fields.');
  }
  if (certificate.children.length > 3) {
    throw new Error('The certificate has unexpected fields after its signature value.');
  }
  const signatureAlgorithm = parseAlgorithmIdentifier(
    certificate.children[1],
    'The signature algorithm',
  );
  // Validated for shape only; the decoder never verifies the signature itself.
  readBitStringBytes(certificate.children[2], 'The certificate signature value');

  const tbs = certificate.children[0];
  expectUniversal(tbs, ASN1_TAG.SEQUENCE, 'The certificate body');
  const fields = tbs.children;
  let cursor = 0;
  let version = 1;

  if (isContext(fields[0], 0) && fields[0].constructed) {
    // `[0]` is EXPLICIT, so it wraps the version INTEGER and nothing else.
    if (fields[0].children.length !== 1) {
      throw new Error('The certificate version wrapper does not hold exactly one element.');
    }
    version = decodeSmallInteger(fields[0].children[0], 'The certificate version') + 1;
    cursor = 1;
  }
  if (fields.length < cursor + 6) {
    throw new Error('The certificate body is missing required fields.');
  }

  const serialNode = expectUniversal(
    fields[cursor],
    ASN1_TAG.INTEGER,
    'The certificate serial number',
  );
  cursor += 1;
  // The signed body repeats the signature AlgorithmIdentifier, and RFC 5280
  // §4.1.1.2 requires it to be the *same* identifier as the outer one. The two
  // complete DER encodings are compared, not just their OIDs, so a body that
  // keeps the OID while rewriting its `parameters` is rejected too. DER gives
  // every AlgorithmIdentifier exactly one encoding, so byte equality is the
  // strictest reading of "the same" and needs no per-algorithm special cases.
  // The outer copy is the one conventionally displayed.
  const tbsSignatureAlgorithm = parseAlgorithmIdentifier(
    fields[cursor],
    'The signed certificate body signature algorithm',
  );
  if (!derEquals(tbsSignatureAlgorithm.der, signatureAlgorithm.der)) {
    throw new Error(
      'The certificate body signature algorithm does not match the outer signature algorithm.',
    );
  }
  cursor += 1;
  const issuer = parseName(fields[cursor], 'The issuer name');
  cursor += 1;
  const validityNode = expectUniversal(
    fields[cursor],
    ASN1_TAG.SEQUENCE,
    'The certificate validity',
  );
  cursor += 1;
  const subject = parseName(fields[cursor], 'The subject name');
  cursor += 1;
  const publicKey = parsePublicKeyInfo(fields[cursor]);
  cursor += 1;

  if (validityNode.children.length !== 2) {
    throw new Error('The certificate validity is not exactly a notBefore and a notAfter.');
  }

  const extensionsNode = readTbsOptionalFields(fields.slice(cursor));
  const extensions = extensionsNode
    ? parseExtensions(extensionsNode.children[0])
    : { all: [], subjectAltNames: [], basicConstraints: null };

  const serialHex = stripLeadingZeroByte(serialNode.content);

  return {
    version,
    serialNumber: serialHex,
    serialNumberGrouped: formatHexGroups(serialHex),
    issuer,
    subject,
    validity: {
      notBefore: decodeAsn1Time(validityNode.children[0]),
      notAfter: decodeAsn1Time(validityNode.children[1]),
    },
    signatureAlgorithm: toAlgorithmSummary(signatureAlgorithm),
    publicKey,
    extensions,
    subjectMatchesIssuer: issuer.text === subject.text,
  };
}

function stripLeadingZeroByte(content) {
  if (content.length === 0) {
    throw new Error('The certificate serial number is empty.');
  }
  const significant = content.length > 1 && content[0] === 0 ? content.subarray(1) : content;
  return toHex(significant);
}

/**
 * Decodes every PEM certificate block found in the supplied text.
 *
 * Each block is decoded independently so that one corrupt certificate in a
 * chain still lets the remaining certificates render.
 *
 * @param {string} text Text containing one or more PEM certificate blocks.
 * @returns {Array<{index: number, certificate?: object, error?: string}>} Per-block results.
 * @throws {Error} When the text is empty or contains no PEM certificate block.
 */
export function decodeCertificates(text) {
  if (typeof text !== 'string' || text.trim() === '') {
    throw new Error('Paste a PEM-encoded certificate to decode it.');
  }

  const blocks = extractPemBlocks(text).filter((block) => CERTIFICATE_LABELS.has(block.label));
  if (blocks.length === 0) {
    throw new Error(
      'No PEM certificate found. Expected a "-----BEGIN CERTIFICATE-----" block.',
    );
  }

  return blocks.map((block, index) => {
    try {
      return { index, certificate: parseCertificate(decodeBase64ToBytes(block.body)) };
    } catch (error) {
      return { index, error: error instanceof Error ? error.message : String(error) };
    }
  });
}

/**
 * Compares a certificate's validity window against a reference time.
 *
 * @param {{notBefore: {date: Date}, notAfter: {date: Date}}} validity Parsed validity window.
 * @param {number} [now] Reference time in Unix milliseconds.
 * @returns {object} Status keyword, boolean flags, and signed distances in milliseconds.
 */
export function getValidityStatus(validity, now = Date.now()) {
  const notBefore = validity.notBefore.date.getTime();
  const notAfter = validity.notAfter.date.getTime();
  const isNotYetValid = now < notBefore;
  const isExpired = now > notAfter;

  let status = 'valid';
  if (isExpired) status = 'expired';
  else if (isNotYetValid) status = 'not-yet-valid';

  return {
    status,
    isExpired,
    isNotYetValid,
    millisecondsUntilValid: notBefore - now,
    millisecondsUntilExpiry: notAfter - now,
  };
}

const DURATION_UNITS = [
  ['year', 31_536_000],
  ['day', 86_400],
  ['hour', 3_600],
  ['minute', 60],
  ['second', 1],
];

/**
 * Formats a duration as at most two human-readable units.
 *
 * @param {number} milliseconds Duration in milliseconds; the sign is ignored.
 * @returns {string} Human-readable duration such as `9 years 11 days`.
 */
export function formatDuration(milliseconds) {
  let remaining = Math.floor(Math.abs(milliseconds) / 1000);
  const parts = [];

  for (const [name, size] of DURATION_UNITS) {
    const amount = Math.floor(remaining / size);
    if (amount > 0 || (name === 'second' && parts.length === 0)) {
      parts.push(`${amount} ${name}${amount === 1 ? '' : 's'}`);
      remaining %= size;
    }
    if (parts.length === 2) break;
  }

  return parts.join(' ');
}
