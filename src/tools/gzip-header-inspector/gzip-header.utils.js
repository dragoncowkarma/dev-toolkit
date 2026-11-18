const FLAG_TEXT = 0x01;
const FLAG_HCRC = 0x02;
const FLAG_EXTRA = 0x04;
const FLAG_NAME = 0x08;
const FLAG_COMMENT = 0x10;
const RESERVED_FLAGS = 0xe0;

const OS_NAMES = {
  0: "FAT filesystem",
  1: "Amiga",
  2: "VMS",
  3: "Unix",
  4: "VM/CMS",
  5: "Atari TOS",
  6: "HPFS",
  7: "Macintosh",
  8: "Z-System",
  9: "CP/M",
  10: "TOPS-20",
  11: "NTFS",
  12: "QDOS",
  13: "Acorn RISCOS",
  255: "Unknown",
};

const LENGTH_EXTRA = [
  0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5,
  5, 5, 0,
];
const DISTANCE_EXTRA = [
  0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11,
  11, 12, 12, 13, 13,
];

function fail(member, message) {
  throw new Error(`Member ${member}: ${message}`);
}

function hex(value, width = 2) {
  return `0x${value.toString(16).toUpperCase().padStart(width, "0")}`;
}

function requireBytes(bytes, offset, count, member, field) {
  if (offset + count > bytes.length) fail(member, `truncated ${field}.`);
}

function readU16(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readU32(bytes, offset) {
  return (
    (bytes[offset] |
      (bytes[offset + 1] << 8) |
      (bytes[offset + 2] << 16) |
      (bytes[offset + 3] << 24)) >>>
    0
  );
}

function readNullTerminated(bytes, offset, member, field) {
  const end = bytes.indexOf(0, offset);
  if (end === -1) fail(member, `truncated ${field}: missing null terminator.`);
  return {
    value: new TextDecoder("latin1").decode(bytes.subarray(offset, end)),
    next: end + 1,
  };
}

function reverseBits(value, width) {
  let reversed = 0;
  for (let index = 0; index < width; index += 1) {
    reversed = (reversed << 1) | (value & 1);
    value >>>= 1;
  }
  return reversed;
}

function buildHuffman(lengths, member, label) {
  const counts = Array(16).fill(0);
  for (const length of lengths) {
    if (length < 0 || length > 15)
      fail(member, `invalid ${label} Huffman code length.`);
    if (length) counts[length] += 1;
  }
  const nextCode = Array(16).fill(0);
  let code = 0;
  for (let length = 1; length <= 15; length += 1) {
    code = (code + counts[length - 1]) << 1;
    nextCode[length] = code;
  }
  const table = new Map();
  lengths.forEach((length, symbol) => {
    if (length)
      table.set(`${length}:${reverseBits(nextCode[length]++, length)}`, symbol);
  });
  return table;
}

function createBitReader(bytes, offset, member) {
  let bitOffset = offset * 8;
  function readBits(count, field) {
    if (bitOffset + count > bytes.length * 8)
      fail(member, `truncated compressed data while reading ${field}.`);
    let value = 0;
    for (let index = 0; index < count; index += 1) {
      const position = bitOffset++;
      value |= ((bytes[position >> 3] >> (position & 7)) & 1) << index;
    }
    return value;
  }
  return {
    readBits,
    align() {
      bitOffset = Math.ceil(bitOffset / 8) * 8;
    },
    get byteOffset() {
      return Math.ceil(bitOffset / 8);
    },
  };
}

function decodeSymbol(reader, table, member, label) {
  let code = 0;
  for (let length = 1; length <= 15; length += 1) {
    code |= reader.readBits(1, label) << (length - 1);
    const symbol = table.get(`${length}:${code}`);
    if (symbol !== undefined) return symbol;
  }
  fail(member, `invalid ${label} Huffman code.`);
}

function fixedTables(member) {
  const literalLengths = Array(288).fill(0);
  literalLengths.fill(8, 0, 144);
  literalLengths.fill(9, 144, 256);
  literalLengths.fill(7, 256, 280);
  literalLengths.fill(8, 280);
  return {
    literal: buildHuffman(literalLengths, member, "fixed literal"),
    distance: buildHuffman(Array(32).fill(5), member, "fixed distance"),
  };
}

function dynamicTables(reader, member) {
  const hlit = reader.readBits(5, "HLIT") + 257;
  const hdist = reader.readBits(5, "HDIST") + 1;
  const hclen = reader.readBits(4, "HCLEN") + 4;
  const order = [
    16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15,
  ];
  const codeLengths = Array(19).fill(0);
  for (let index = 0; index < hclen; index += 1)
    codeLengths[order[index]] = reader.readBits(3, "code-length alphabet");
  const codeTable = buildHuffman(codeLengths, member, "code-length");
  const lengths = [];
  while (lengths.length < hlit + hdist) {
    const symbol = decodeSymbol(reader, codeTable, member, "code-length");
    if (symbol < 16) lengths.push(symbol);
    else {
      const previous = lengths[lengths.length - 1];
      const extra = symbol === 16 ? 2 : symbol === 17 ? 3 : 7;
      const base = symbol === 16 ? 3 : symbol === 17 ? 3 : 11;
      if (symbol === 16 && previous === undefined)
        fail(member, "invalid code-length repeat.");
      const count = base + reader.readBits(extra, "code-length repeat");
      if (lengths.length + count > hlit + hdist)
        fail(member, "invalid code-length repeat exceeds table.");
      lengths.push(...Array(count).fill(symbol === 16 ? previous : 0));
    }
  }
  return {
    literal: buildHuffman(lengths.slice(0, hlit), member, "literal"),
    distance: buildHuffman(lengths.slice(hlit), member, "distance"),
  };
}

function skipCompressedData(bytes, offset, member) {
  const reader = createBitReader(bytes, offset, member);
  let finalBlock = 0;
  do {
    finalBlock = reader.readBits(1, "BFINAL");
    const type = reader.readBits(2, "BTYPE");
    if (type === 0) {
      reader.align();
      const length = reader.readBits(16, "stored block length");
      const complement = reader.readBits(16, "stored block complement");
      if ((length ^ 0xffff) !== complement)
        fail(member, "invalid stored block length.");
      reader.readBits(length * 8, "stored block data");
      continue;
    }
    if (type === 3) fail(member, "invalid DEFLATE block type.");
    const tables =
      type === 1 ? fixedTables(member) : dynamicTables(reader, member);
    for (;;) {
      const symbol = decodeSymbol(
        reader,
        tables.literal,
        member,
        "literal/length",
      );
      if (symbol < 256) continue;
      if (symbol === 256) break;
      if (symbol < 257 || symbol > 285) fail(member, "invalid length symbol.");
      const lengthIndex = symbol - 257;
      reader.readBits(LENGTH_EXTRA[lengthIndex], "length extra bits");
      const distance = decodeSymbol(
        reader,
        tables.distance,
        member,
        "distance",
      );
      if (distance > 29) fail(member, "invalid distance symbol.");
      reader.readBits(DISTANCE_EXTRA[distance], "distance extra bits");
    }
  } while (!finalBlock);
  return reader.byteOffset;
}

/** Parses every RFC 1952 member without inflating its compressed payload. */
export function parseGzipMembers(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.length < 2 || bytes[0] !== 0x1f || bytes[1] !== 0x8b)
    throw new Error("Not a GZIP file: expected magic bytes 1F 8B.");
  const members = [];
  let offset = 0;
  while (offset < bytes.length) {
    const member = members.length + 1;
    requireBytes(bytes, offset, 10, member, "fixed header");
    if (bytes[offset] !== 0x1f || bytes[offset + 1] !== 0x8b)
      fail(member, "expected GZIP magic bytes 1F 8B.");
    if (bytes[offset + 2] !== 8)
      fail(
        member,
        `unsupported compression method ${hex(bytes[offset + 2])}; expected 0x08 (deflate).`,
      );
    const flags = bytes[offset + 3];
    if (flags & RESERVED_FLAGS)
      fail(member, `reserved flag bits are set (${hex(flags)}).`);
    const mtime = readU32(bytes, offset + 4);
    const result = {
      index: member,
      compressionMethod: "Deflate (0x08)",
      flags: {
        text: !!(flags & FLAG_TEXT),
        headerCrc: !!(flags & FLAG_HCRC),
        extra: !!(flags & FLAG_EXTRA),
        name: !!(flags & FLAG_NAME),
        comment: !!(flags & FLAG_COMMENT),
      },
      modifiedTime: mtime
        ? new Date(mtime * 1000).toISOString()
        : "Not specified",
      extraFlags: hex(bytes[offset + 8]),
      operatingSystem: `${OS_NAMES[bytes[offset + 9]] ?? "Reserved"} (${hex(bytes[offset + 9])})`,
    };
    offset += 10;
    if (flags & FLAG_EXTRA) {
      requireBytes(bytes, offset, 2, member, "FEXTRA length");
      const length = readU16(bytes, offset);
      offset += 2;
      requireBytes(bytes, offset, length, member, "FEXTRA data");
      const end = offset + length;
      const subfields = [];
      while (offset < end) {
        if (end - offset < 4) fail(member, "truncated FEXTRA subfield header.");
        const id = String.fromCharCode(bytes[offset], bytes[offset + 1]);
        const size = readU16(bytes, offset + 2);
        offset += 4;
        if (offset + size > end)
          fail(member, `truncated FEXTRA subfield ${id}.`);
        subfields.push({
          id,
          length: size,
          data: Array.from(bytes.subarray(offset, offset + size), (value) =>
            value.toString(16).padStart(2, "0"),
          ).join(" "),
        });
        offset += size;
      }
      result.extraFields = subfields;
    }
    if (flags & FLAG_NAME) {
      const field = readNullTerminated(bytes, offset, member, "FNAME");
      result.originalFilename = field.value;
      offset = field.next;
    }
    if (flags & FLAG_COMMENT) {
      const field = readNullTerminated(bytes, offset, member, "FCOMMENT");
      result.comment = field.value;
      offset = field.next;
    }
    if (flags & FLAG_HCRC) {
      requireBytes(bytes, offset, 2, member, "FHCRC");
      result.headerCrc16 = hex(readU16(bytes, offset), 4);
      offset += 2;
    }
    const trailerOffset = skipCompressedData(bytes, offset, member);
    requireBytes(bytes, trailerOffset, 8, member, "trailer");
    result.crc32 = hex(readU32(bytes, trailerOffset), 8);
    result.inputSize = readU32(bytes, trailerOffset + 4);
    members.push(result);
    offset = trailerOffset + 8;
  }
  return members;
}
