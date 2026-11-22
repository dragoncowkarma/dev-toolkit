class BitReader {
  constructor(bytes) {
    this.bytes = bytes;
    this.bitOffset = 0;
  }

  readBits(count, fieldName) {
    if (this.bitOffset + count > this.bytes.length * 8) {
      throw new Error(`Truncated Brotli stream while reading ${fieldName}.`);
    }

    let value = 0;
    for (let index = 0; index < count; index += 1) {
      const position = this.bitOffset + index;
      value |= ((this.bytes[position >> 3] >> (position & 7)) & 1) << index;
    }
    this.bitOffset += count;
    return value;
  }

  skipToByteBoundary(fieldName) {
    const remainingBits = (8 - (this.bitOffset & 7)) & 7;
    if (remainingBits === 0) return;
    if (this.readBits(remainingBits, fieldName) !== 0) {
      throw new Error(`Invalid Brotli stream: ${fieldName} must be zero.`);
    }
  }

  skipBytes(count, fieldName) {
    if (this.bitOffset & 7) {
      throw new Error(`Invalid Brotli parser state while skipping ${fieldName}.`);
    }
    if (this.bitOffset + count * 8 > this.bytes.length * 8) {
      throw new Error(`Truncated Brotli stream while reading ${fieldName}.`);
    }
    this.bitOffset += count * 8;
  }
}

function readWindowBits(reader) {
  if (reader.readBits(1, 'WBITS') === 0) return 16;

  const shortCode = reader.readBits(3, 'WBITS');
  if (shortCode !== 0) return 17 + shortCode;

  const longCodes = [17, null, 10, 14, 12, 13, 11, 15];
  const longCode = reader.readBits(3, 'WBITS');
  const windowBits = longCodes[longCode];
  if (windowBits === null) {
    throw new Error('Invalid Brotli stream: WBITS uses a reserved value.');
  }
  return windowBits;
}

function readMetaBlockLength(reader) {
  const nibbleCodes = [4, 5, 6, 0];
  const mnibbles = nibbleCodes[reader.readBits(2, 'MNIBBLES')];
  if (mnibbles === 0) return { mnibbles, length: null };

  const encodedLength = reader.readBits(mnibbles * 4, 'MLEN');
  if (mnibbles > 4 && encodedLength >> ((mnibbles - 1) * 4) === 0) {
    throw new Error('Invalid Brotli stream: MLEN has a leading zero nibble.');
  }
  return { mnibbles, length: encodedLength + 1 };
}

function readMetadataLength(reader) {
  if (reader.readBits(1, 'metadata reserved bit') !== 0) {
    throw new Error('Invalid Brotli stream: metadata reserved bit must be zero.');
  }
  const byteCount = reader.readBits(2, 'MSKIPBYTES');
  if (byteCount === 0) return { byteCount, length: 0 };

  const encodedLength = reader.readBits(byteCount * 8, 'MSKIPLEN');
  if (byteCount > 1 && encodedLength >> ((byteCount - 1) * 8) === 0) {
    throw new Error('Invalid Brotli stream: MSKIPLEN has a leading zero byte.');
  }
  return { byteCount, length: encodedLength + 1 };
}

/**
 * Parses the Brotli stream header and its first meta-block header according to RFC 7932.
 *
 * @param {Uint8Array} bytes - Raw Brotli stream bytes.
 * @returns {{windowBits: number, windowSize: number, firstMetaBlock: object}}
 * @throws {Error} When the supplied bytes do not contain a valid complete header.
 */
export function inspectBrotliHeader(bytes) {
  if (!(bytes instanceof Uint8Array)) {
    throw new TypeError('Brotli data must be a Uint8Array.');
  }
  if (bytes.length === 0) {
    throw new Error('Truncated Brotli stream while reading WBITS.');
  }

  const reader = new BitReader(bytes);
  const windowBits = readWindowBits(reader);
  const isLast = reader.readBits(1, 'ISLAST') === 1;
  const firstMetaBlock = { isLast, isLastEmpty: false };

  if (isLast) {
    firstMetaBlock.isLastEmpty = reader.readBits(1, 'ISLASTEMPTY') === 1;
    if (firstMetaBlock.isLastEmpty) {
      reader.skipToByteBoundary('final stream fill bits');
      if (reader.bitOffset !== bytes.length * 8) {
        throw new Error('Invalid Brotli stream: bytes follow the final empty meta-block.');
      }
      return {
        windowBits,
        windowSize: (1 << windowBits) - 16,
        firstMetaBlock,
      };
    }
  }

  const { mnibbles, length } = readMetaBlockLength(reader);
  firstMetaBlock.mnibbles = mnibbles;
  firstMetaBlock.length = length;

  if (mnibbles === 0) {
    const metadata = readMetadataLength(reader);
    firstMetaBlock.metadataLength = metadata.length;
    firstMetaBlock.metadataLengthBytes = metadata.byteCount;
    reader.skipToByteBoundary('metadata fill bits');
    reader.skipBytes(metadata.length, 'metadata bytes');
  } else if (!isLast) {
    firstMetaBlock.isUncompressed = reader.readBits(1, 'ISUNCOMPRESSED') === 1;
    if (firstMetaBlock.isUncompressed) {
      reader.skipToByteBoundary('uncompressed meta-block fill bits');
      reader.skipBytes(length, 'uncompressed meta-block data');
    }
  }

  return {
    windowBits,
    windowSize: (1 << windowBits) - 16,
    firstMetaBlock,
  };
}
