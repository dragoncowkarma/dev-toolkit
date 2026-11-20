const STANDARD_MAGIC = [0x28, 0xb5, 0x2f, 0xfd];
const SKIPPABLE_MAGIC_PREFIX = [0x50, 0x2a, 0x4d, 0x18];

function requireBytes(bytes, offset, length, field, frameNumber) {
  if (offset + length > bytes.length) {
    throw new Error(
      `Frame ${frameNumber}: truncated ${field}; expected ${length} ` +
        `byte${length === 1 ? '' : 's'} ` +
        `at offset ${offset}, but only ${bytes.length - offset} remain.`
    );
  }
}

function readLittleEndian(bytes, offset, length, field, frameNumber) {
  requireBytes(bytes, offset, length, field, frameNumber);
  let value = 0n;
  for (let index = 0; index < length; index += 1) {
    value |= BigInt(bytes[offset + index]) << BigInt(index * 8);
  }
  return value;
}

function formatBytes(value) {
  const numericValue = typeof value === 'bigint' ? value : BigInt(value);
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'];
  let unitIndex = 0;
  let displayValue = numericValue;
  while (displayValue >= 1024n && unitIndex < units.length - 1) {
    displayValue /= 1024n;
    unitIndex += 1;
  }
  return unitIndex === 0
    ? `${numericValue} B`
    : `${displayValue} ${units[unitIndex]} (${numericValue} B)`;
}

function isStandardMagic(bytes, offset) {
  return STANDARD_MAGIC.every((value, index) => bytes[offset + index] === value);
}

function isSkippableMagic(bytes, offset) {
  return (
    bytes[offset] >= SKIPPABLE_MAGIC_PREFIX[0] &&
    bytes[offset] <= 0x5f &&
    SKIPPABLE_MAGIC_PREFIX.slice(1).every((value, index) => bytes[offset + index + 1] === value)
  );
}

function getFrameContentSizeLength(flag, singleSegment) {
  if (flag === 0) return singleSegment ? 1 : 0;
  if (flag === 1) return 2;
  if (flag === 2) return 4;
  return 8;
}

function getDictionaryIdLength(flag) {
  return [0, 1, 2, 4][flag];
}

function skipBlocks(bytes, offset, checksum, frameNumber) {
  let cursor = offset;
  let lastBlock = false;
  while (!lastBlock) {
    const blockHeader = Number(readLittleEndian(bytes, cursor, 3, 'block header', frameNumber));
    cursor += 3;
    lastBlock = (blockHeader & 1) !== 0;
    const blockType = (blockHeader >>> 1) & 0x3;
    const blockSize = blockHeader >>> 3;
    if (blockType === 3) {
      throw new Error(`Frame ${frameNumber}: reserved block type at offset ${cursor - 3}.`);
    }
    const payloadLength = blockType === 1 ? 1 : blockSize;
    requireBytes(bytes, cursor, payloadLength, 'block payload', frameNumber);
    cursor += payloadLength;
  }
  if (checksum) {
    requireBytes(bytes, cursor, 4, 'content checksum', frameNumber);
    cursor += 4;
  }
  return cursor;
}

function parseStandardFrame(bytes, offset, frameNumber) {
  let cursor = offset + 4;
  requireBytes(bytes, cursor, 1, 'Frame_Header_Descriptor', frameNumber);
  const descriptor = bytes[cursor];
  cursor += 1;
  const frameContentSizeFlag = descriptor >>> 6;
  const singleSegment = (descriptor & 0x20) !== 0;
  const unusedBit = (descriptor & 0x10) !== 0;
  const reservedBit = (descriptor & 0x08) !== 0;
  const contentChecksum = (descriptor & 0x04) !== 0;
  const dictionaryIdFlag = descriptor & 0x03;
  if (reservedBit) {
    throw new Error(`Frame ${frameNumber}: reserved bit is set in Frame_Header_Descriptor.`);
  }

  let windowSize = null;
  if (!singleSegment) {
    requireBytes(bytes, cursor, 1, 'Window_Descriptor', frameNumber);
    const windowDescriptor = bytes[cursor];
    cursor += 1;
    const exponent = windowDescriptor >>> 3;
    const mantissa = windowDescriptor & 0x07;
    const windowLog = 10 + exponent;
    const windowBase = 1n << BigInt(windowLog);
    windowSize = windowBase + ((windowBase / 8n) * BigInt(mantissa));
  }

  const dictionaryIdLength = getDictionaryIdLength(dictionaryIdFlag);
  const dictionaryId = dictionaryIdLength
    ? readLittleEndian(bytes, cursor, dictionaryIdLength, 'Dictionary_ID', frameNumber)
    : null;
  cursor += dictionaryIdLength;

  const frameContentSizeLength = getFrameContentSizeLength(frameContentSizeFlag, singleSegment);
  let frameContentSize = null;
  if (frameContentSizeLength) {
    frameContentSize = readLittleEndian(
      bytes,
      cursor,
      frameContentSizeLength,
      'Frame_Content_Size',
      frameNumber
    );
    if (frameContentSizeFlag === 1) frameContentSize += 256n;
  }
  cursor += frameContentSizeLength;
  const headerEnd = cursor;
  const endOffset = skipBlocks(bytes, cursor, contentChecksum, frameNumber);

  return {
    endOffset,
    frame: {
      type: 'Standard Zstandard frame',
      offset,
      headerLength: headerEnd - offset,
      frameContentSizeFlag,
      singleSegment: singleSegment ? 'set' : 'not set',
      unusedBit: unusedBit ? 'set' : 'not set',
      reservedBit: 'not set',
      contentChecksum: contentChecksum ? 'present' : 'absent',
      dictionaryId: dictionaryId === null ? 'absent' : dictionaryId.toString(),
      windowSize: windowSize === null ? 'not present (single segment)' : formatBytes(windowSize),
      frameContentSize: frameContentSize === null ? 'unknown' : formatBytes(frameContentSize),
    },
  };
}

function parseSkippableFrame(bytes, offset, frameNumber) {
  const frameSize = readLittleEndian(bytes, offset + 4, 4, 'skippable Frame_Size', frameNumber);
  const endOffset = offset + 8 + Number(frameSize);
  requireBytes(bytes, offset + 8, Number(frameSize), 'skippable frame payload', frameNumber);
  return {
    endOffset,
    frame: {
      type: 'Skippable frame',
      offset,
      frameSize: formatBytes(frameSize),
    },
  };
}

/**
 * Parses Zstandard frame headers without decompressing or exposing frame content.
 * @param {ArrayBuffer|Uint8Array} input - Bytes containing one or more complete Zstandard frames.
 * @returns {Array<object>} Parsed frame metadata.
 */
export function parseZstdFrames(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.length === 0) throw new Error('Input is empty. Select a Zstandard stream.');
  const frames = [];
  let offset = 0;
  while (offset < bytes.length) {
    const frameNumber = frames.length + 1;
    requireBytes(bytes, offset, 4, 'frame magic number', frameNumber);
    let parsed;
    if (isStandardMagic(bytes, offset)) {
      parsed = parseStandardFrame(bytes, offset, frameNumber);
    } else if (isSkippableMagic(bytes, offset)) {
      parsed = parseSkippableFrame(bytes, offset, frameNumber);
    } else {
      const magic = Array.from(bytes.slice(offset, offset + 4))
        .map((value) => value.toString(16).padStart(2, '0').toUpperCase())
        .join(' ');
      throw new Error(`Frame ${frameNumber}: unsupported Zstandard magic number ${magic}.`);
    }
    frames.push(parsed.frame);
    offset = parsed.endOffset;
  }
  return frames;
}
