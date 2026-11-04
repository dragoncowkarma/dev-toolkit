const TYPE_NAMES = {
  1: 'A',
  2: 'NS',
  5: 'CNAME',
  6: 'SOA',
  12: 'PTR',
  15: 'MX',
  16: 'TXT',
  28: 'AAAA',
};

const CLASS_NAMES = { 1: 'IN', 3: 'CH', 4: 'HS', 255: 'ANY' };
const RCODE_NAMES = {
  0: 'NOERROR',
  1: 'FORMERR',
  2: 'SERVFAIL',
  3: 'NXDOMAIN',
  4: 'NOTIMP',
  5: 'REFUSED',
};

function packetError(message) {
  return new Error(`Invalid DNS packet: ${message}`);
}

function requireBytes(bytes, offset, length, label) {
  if (!Number.isSafeInteger(offset) || offset < 0 || offset + length > bytes.length) {
    throw packetError(`truncated ${label}.`);
  }
}

function readUint16(bytes, offset, label = '16-bit field') {
  requireBytes(bytes, offset, 2, label);
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function readUint32(bytes, offset, label = '32-bit field') {
  requireBytes(bytes, offset, 4, label);
  return (
    bytes[offset] * 0x1000000 +
    (bytes[offset + 1] << 16) +
    (bytes[offset + 2] << 8) +
    bytes[offset + 3]
  );
}

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function textFromBytes(bytes) {
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
}

function typeName(value) {
  return TYPE_NAMES[value] ?? `TYPE${value}`;
}

function className(value) {
  return CLASS_NAMES[value] ?? `CLASS${value}`;
}

/**
 * Decodes an RFC 1035 domain name, following compression pointers safely.
 * @param {Uint8Array} bytes DNS message bytes.
 * @param {number} offset Offset of the encoded name.
 * @returns {{ value: string, nextOffset: number }} Decoded name and first unread offset.
 */
export function decodeDnsName(bytes, offset) {
  requireBytes(bytes, offset, 1, 'domain name');
  const labels = [];
  const visitedOffsets = new Set();
  let position = offset;
  let nextOffset = offset;
  let followedPointer = false;

  while (true) {
    requireBytes(bytes, position, 1, 'domain name');
    if (visitedOffsets.has(position)) {
      throw packetError('circular compression pointer.');
    }
    visitedOffsets.add(position);

    const length = bytes[position];
    if (length === 0) {
      if (!followedPointer) nextOffset = position + 1;
      return { value: labels.length ? labels.join('.') : '.', nextOffset };
    }

    if ((length & 0xc0) === 0xc0) {
      requireBytes(bytes, position, 2, 'compression pointer');
      const target = ((length & 0x3f) << 8) | bytes[position + 1];
      if (target >= bytes.length) {
        throw packetError('compression pointer points outside the message.');
      }
      if (!followedPointer) nextOffset = position + 2;
      followedPointer = true;
      position = target;
      continue;
    }

    if ((length & 0xc0) !== 0 || length > 63) {
      throw packetError('invalid domain-name label length.');
    }
    requireBytes(bytes, position + 1, length, 'domain-name label');
    labels.push(textFromBytes(bytes.slice(position + 1, position + 1 + length)));
    position += length + 1;
    if (!followedPointer) nextOffset = position;
  }
}

/**
 * Converts hex or Base64 user input into packet bytes.
 * @param {string} input Encoded packet input.
 * @param {'hex'|'base64'} format Input encoding.
 * @returns {Uint8Array} Packet bytes.
 */
export function decodePacketInput(input, format) {
  if (typeof input !== 'string') throw new TypeError('Input must be a string.');
  const cleaned = input.replace(/\s/g, '');
  if (!cleaned) throw packetError('input is empty.');

  if (format === 'hex') {
    if (!/^[0-9a-fA-F]+$/.test(cleaned) || cleaned.length % 2 !== 0) {
      throw packetError('hex input must contain complete hexadecimal byte pairs.');
    }
    return Uint8Array.from(cleaned.match(/../g), (pair) => Number.parseInt(pair, 16));
  }

  if (format === 'base64') {
    const base64Pattern = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
    if (cleaned.length % 4 !== 0 || !base64Pattern.test(cleaned)) {
      throw packetError('Base64 input is malformed.');
    }
    try {
      return Uint8Array.from(atob(cleaned), (character) => character.charCodeAt(0));
    } catch {
      throw packetError('Base64 input is malformed.');
    }
  }

  throw new TypeError('Format must be "hex" or "base64".');
}

function parseQuestion(bytes, offset) {
  const name = decodeDnsName(bytes, offset);
  const type = readUint16(bytes, name.nextOffset, 'question type');
  const classValue = readUint16(bytes, name.nextOffset + 2, 'question class');
  return {
    value: {
      name: name.value,
      type,
      typeName: typeName(type),
      class: classValue,
      className: className(classValue),
    },
    nextOffset: name.nextOffset + 4,
  };
}

function formatIpv6(bytes) {
  const groups = [];
  for (let index = 0; index < 16; index += 2) {
    groups.push((bytes[index] * 256 + bytes[index + 1]).toString(16));
  }
  let bestStart = -1;
  let bestLength = 0;
  for (let index = 0; index < groups.length; ) {
    if (groups[index] !== '0') {
      index += 1;
      continue;
    }
    const start = index;
    while (index < groups.length && groups[index] === '0') index += 1;
    if (index - start > bestLength && index - start > 1) {
      bestStart = start;
      bestLength = index - start;
    }
  }
  if (bestStart === -1) return groups.join(':');
  const before = groups.slice(0, bestStart).join(':');
  const after = groups.slice(bestStart + bestLength).join(':');
  return `${before}::${after}`;
}

function nameRdata(bytes, rdataOffset, endOffset, type) {
  const decoded = decodeDnsName(bytes, rdataOffset);
  if (decoded.nextOffset !== endOffset) throw packetError(`malformed ${type} RDATA.`);
  return decoded.value;
}

function parseRdata(bytes, type, rdataOffset, rdataLength) {
  const endOffset = rdataOffset + rdataLength;
  if (type === 1) {
    if (rdataLength !== 4) throw packetError('malformed A RDATA.');
    return Array.from(bytes.slice(rdataOffset, endOffset)).join('.');
  }
  if (type === 28) {
    if (rdataLength !== 16) throw packetError('malformed AAAA RDATA.');
    return formatIpv6(bytes.slice(rdataOffset, endOffset));
  }
  if ([2, 5, 12].includes(type)) return nameRdata(bytes, rdataOffset, endOffset, typeName(type));
  if (type === 15) {
    if (rdataLength < 3) throw packetError('malformed MX RDATA.');
    const preference = readUint16(bytes, rdataOffset, 'MX preference');
    const exchange = nameRdata(bytes, rdataOffset + 2, endOffset, 'MX');
    return { preference, exchange };
  }
  if (type === 16) {
    const strings = [];
    let position = rdataOffset;
    while (position < endOffset) {
      const length = bytes[position];
      if (position + length + 1 > endOffset) throw packetError('truncated TXT string.');
      strings.push(textFromBytes(bytes.slice(position + 1, position + length + 1)));
      position += length + 1;
    }
    return strings;
  }
  if (type === 6) {
    const primary = decodeDnsName(bytes, rdataOffset);
    const mailbox = decodeDnsName(bytes, primary.nextOffset);
    if (mailbox.nextOffset + 20 !== endOffset) throw packetError('malformed SOA RDATA.');
    return {
      primaryNameserver: primary.value,
      responsibleMailbox: mailbox.value,
      serial: readUint32(bytes, mailbox.nextOffset, 'SOA serial'),
      refresh: readUint32(bytes, mailbox.nextOffset + 4, 'SOA refresh'),
      retry: readUint32(bytes, mailbox.nextOffset + 8, 'SOA retry'),
      expire: readUint32(bytes, mailbox.nextOffset + 12, 'SOA expire'),
      minimum: readUint32(bytes, mailbox.nextOffset + 16, 'SOA minimum'),
    };
  }
  return bytesToHex(bytes.slice(rdataOffset, endOffset));
}

function parseRecord(bytes, offset) {
  const name = decodeDnsName(bytes, offset);
  const type = readUint16(bytes, name.nextOffset, 'record type');
  const classValue = readUint16(bytes, name.nextOffset + 2, 'record class');
  const ttl = readUint32(bytes, name.nextOffset + 4, 'record TTL');
  const rdLength = readUint16(bytes, name.nextOffset + 8, 'record length');
  const rdataOffset = name.nextOffset + 10;
  requireBytes(bytes, rdataOffset, rdLength, 'record data');
  return {
    value: {
      name: name.value,
      type,
      typeName: typeName(type),
      class: classValue,
      className: className(classValue),
      ttl,
      rdLength,
      data: parseRdata(bytes, type, rdataOffset, rdLength),
    },
    nextOffset: rdataOffset + rdLength,
  };
}

function parseRecords(bytes, offset, count, section) {
  const records = [];
  let position = offset;
  for (let index = 0; index < count; index += 1) {
    const parsed = parseRecord(bytes, position);
    records.push(parsed.value);
    position = parsed.nextOffset;
  }
  return { records, nextOffset: position, section };
}

/**
 * Parses a complete RFC 1035 DNS message.
 * @param {Uint8Array} bytes DNS packet bytes.
 * @returns {object} Structured DNS header and message sections.
 */
export function parseDnsPacket(bytes) {
  if (!(bytes instanceof Uint8Array)) throw new TypeError('Packet must be a Uint8Array.');
  requireBytes(bytes, 0, 12, 'DNS header');
  const flagsValue = readUint16(bytes, 2, 'DNS flags');
  const header = {
    id: readUint16(bytes, 0, 'transaction ID'),
    flags: {
      value: flagsValue,
      qr: Boolean(flagsValue & 0x8000),
      opcode: (flagsValue >> 11) & 0x0f,
      aa: Boolean(flagsValue & 0x0400),
      tc: Boolean(flagsValue & 0x0200),
      rd: Boolean(flagsValue & 0x0100),
      ra: Boolean(flagsValue & 0x0080),
      z: (flagsValue >> 4) & 0x07,
      rcode: flagsValue & 0x0f,
      rcodeName: RCODE_NAMES[flagsValue & 0x0f] ?? `RCODE${flagsValue & 0x0f}`,
    },
    questionCount: readUint16(bytes, 4, 'question count'),
    answerCount: readUint16(bytes, 6, 'answer count'),
    authorityCount: readUint16(bytes, 8, 'authority count'),
    additionalCount: readUint16(bytes, 10, 'additional count'),
  };
  let offset = 12;
  const questions = [];
  for (let index = 0; index < header.questionCount; index += 1) {
    const parsed = parseQuestion(bytes, offset);
    questions.push(parsed.value);
    offset = parsed.nextOffset;
  }
  const answers = parseRecords(bytes, offset, header.answerCount, 'answers');
  const authorities = parseRecords(bytes, answers.nextOffset, header.authorityCount, 'authority');
  const additionals = parseRecords(
    bytes,
    authorities.nextOffset,
    header.additionalCount,
    'additional',
  );
  if (additionals.nextOffset !== bytes.length) {
    throw packetError('trailing bytes after the message.');
  }
  return {
    header,
    questions,
    answers: answers.records,
    authorities: authorities.records,
    additionals: additionals.records,
  };
}

/**
 * Decodes and parses a user-supplied DNS message.
 * @param {string} input Encoded packet input.
 * @param {'hex'|'base64'} format Input encoding.
 * @returns {object} Structured DNS message.
 */
export function parseDnsPacketInput(input, format) {
  return parseDnsPacket(decodePacketInput(input, format));
}
