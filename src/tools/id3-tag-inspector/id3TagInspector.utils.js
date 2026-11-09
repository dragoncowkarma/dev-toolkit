const ID3V1_GENRES = [
  'Blues', 'Classic Rock', 'Country', 'Dance', 'Disco', 'Funk', 'Grunge', 'Hip-Hop',
  'Jazz', 'Metal', 'New Age', 'Oldies', 'Other', 'Pop', 'R&B', 'Rap', 'Reggae', 'Rock',
];

const V22_FRAME_NAMES = {
  TT2: 'TIT2', TP1: 'TPE1', TAL: 'TALB', TYE: 'TYER', TCO: 'TCON', PIC: 'APIC', COM: 'COMM',
};

function isMagic(bytes, offset, value) {
  return value.split('').every((character, index) => bytes[offset + index] === character.charCodeAt(0));
}

function readSynchsafe(bytes, offset) {
  const values = bytes.slice(offset, offset + 4);
  if (values.length !== 4 || values.some((value) => value > 0x7f)) {
    throw new Error('The ID3v2 tag has an invalid synchsafe size.');
  }
  return values.reduce((size, value) => (size << 7) | value, 0);
}

function readUint32(bytes, offset) {
  return ((bytes[offset] << 24) >>> 0) + (bytes[offset + 1] << 16) +
    (bytes[offset + 2] << 8) + bytes[offset + 3];
}

function trimText(text) {
  return text.replace(/\0/g, '').trim();
}

function decodeText(bytes, encoding = 0) {
  if (!bytes.length) return '';
  if (encoding === 0) return trimText(new TextDecoder('windows-1252').decode(bytes));
  if (encoding === 1) {
    const hasLittleEndianBom = bytes[0] === 0xff && bytes[1] === 0xfe;
    const hasBigEndianBom = bytes[0] === 0xfe && bytes[1] === 0xff;
    const decoder = new TextDecoder(hasBigEndianBom ? 'utf-16be' : 'utf-16le');
    return trimText(decoder.decode(bytes.slice(hasLittleEndianBom || hasBigEndianBom ? 2 : 0)));
  }
  if (encoding === 2) return trimText(new TextDecoder('utf-16be').decode(bytes));
  if (encoding === 3) return trimText(new TextDecoder('utf-8').decode(bytes));
  throw new Error(`The ID3v2 tag uses unsupported text encoding ${encoding}.`);
}

function encodedTerminatorLength(encoding) {
  return encoding === 1 || encoding === 2 ? 2 : 1;
}

function findEncodedTerminator(bytes, offset, encoding) {
  const terminatorLength = encodedTerminatorLength(encoding);
  for (let index = offset; index <= bytes.length - terminatorLength; index += 1) {
    if (bytes[index] === 0 && (terminatorLength === 1 || bytes[index + 1] === 0)) return index;
  }
  return bytes.length;
}

function parseComment(bytes) {
  if (bytes.length < 4) throw new Error('The COMM frame is truncated.');
  const encoding = bytes[0];
  const textStart = findEncodedTerminator(bytes, 4, encoding) + encodedTerminatorLength(encoding);
  return decodeText(bytes.slice(Math.min(textStart, bytes.length)), encoding);
}

function parseCoverArt(bytes, version) {
  if (bytes.length < 2) throw new Error('The cover-art frame is truncated.');
  const encoding = bytes[0];
  if (version === 2) {
    if (bytes.length < 5) throw new Error('The PIC frame is truncated.');
    return { present: true, mimeType: `image/${decodeText(bytes.slice(1, 4), 0).toLowerCase()}` };
  }
  const mimeEnd = bytes.indexOf(0, 1);
  if (mimeEnd === -1) throw new Error('The APIC frame has no MIME type terminator.');
  // Validate the description boundary too: accepting a malformed APIC would hide a corrupt tag.
  findEncodedTerminator(bytes, mimeEnd + 2, encoding);
  return { present: true, mimeType: decodeText(bytes.slice(1, mimeEnd), 0) };
}

function parseV2Frames(bytes, version, flags) {
  let offset = 0;
  if (flags & 0x40) {
    if (bytes.length < 4) throw new Error('The ID3v2 extended header is truncated.');
    const extendedSize = version === 4 ? readSynchsafe(bytes, 0) : readUint32(bytes, 0) + 4;
    if (extendedSize > bytes.length || extendedSize < 4) {
      throw new Error('The ID3v2 extended header has an invalid size.');
    }
    offset = extendedSize;
  }

  const fields = {};
  let coverArt = null;
  const frameHeaderLength = version === 2 ? 6 : 10;
  while (offset + frameHeaderLength <= bytes.length) {
    const rawId = new TextDecoder('ascii').decode(bytes.slice(offset, offset + (version === 2 ? 3 : 4)));
    if (/^\0+$/.test(rawId)) break;
    if (!/^[A-Z0-9]{3,4}$/.test(rawId)) throw new Error('The ID3v2 tag contains an invalid frame identifier.');
    const frameSize = version === 2
      ? (bytes[offset + 3] << 16) + (bytes[offset + 4] << 8) + bytes[offset + 5]
      : version === 4 ? readSynchsafe(bytes, offset + 4) : readUint32(bytes, offset + 4);
    const contentStart = offset + frameHeaderLength;
    const contentEnd = contentStart + frameSize;
    if (contentEnd > bytes.length) throw new Error(`The ${rawId} frame extends beyond the ID3v2 tag.`);
    const frameId = V22_FRAME_NAMES[rawId] || rawId;
    const content = bytes.slice(contentStart, contentEnd);
    if (['TIT2', 'TPE1', 'TALB', 'TYER', 'TDRC', 'TCON'].includes(frameId) && content.length) {
      const fieldName = { TIT2: 'title', TPE1: 'artist', TALB: 'album', TYER: 'year', TDRC: 'year', TCON: 'genre' }[frameId];
      fields[fieldName] = decodeText(content.slice(1), content[0]);
    } else if (frameId === 'COMM') {
      fields.comment = parseComment(content);
    } else if (frameId === 'APIC') {
      coverArt = parseCoverArt(content, version);
    }
    offset = contentEnd;
  }
  return { fields, coverArt };
}

function parseId3v2(bytes) {
  if (!isMagic(bytes, 0, 'ID3')) return null;
  if (bytes.length < 10) throw new Error('The ID3v2 header is truncated.');
  const version = bytes[3];
  if (![2, 3, 4].includes(version)) throw new Error(`ID3v2.${version} is not supported.`);
  const declaredSize = readSynchsafe(bytes, 6);
  const tagEnd = 10 + declaredSize;
  if (tagEnd > bytes.length) throw new Error('The ID3v2 declared size exceeds the file length.');
  const parsed = parseV2Frames(bytes.slice(10, tagEnd), version, bytes[5]);
  return { version: `2.${version}`, size: declaredSize, ...parsed };
}

function parseId3v1(bytes) {
  if (bytes.length < 128 || !isMagic(bytes, bytes.length - 128, 'TAG')) return null;
  const start = bytes.length - 128;
  const text = (offset, length) => decodeText(bytes.slice(start + offset, start + offset + length));
  const genreCode = bytes[start + 127];
  return {
    version: '1.0',
    fields: {
      title: text(3, 30), artist: text(33, 30), album: text(63, 30), year: text(93, 4),
      comment: text(97, 30), genre: ID3V1_GENRES[genreCode] || `Genre ${genreCode}`,
    },
  };
}

/**
 * Parses the supported ID3v1 and ID3v2 tags from an MP3 ArrayBuffer.
 *
 * @param {ArrayBuffer} buffer - Raw MP3 file bytes.
 * @returns {{v1: object|null, v2: object|null, fields: object, hasTag: boolean}}
 * @throws {Error} When a detected tag is corrupt or unsupported.
 */
export function parseId3Tags(buffer) {
  if (!(buffer instanceof ArrayBuffer)) throw new TypeError('Expected an ArrayBuffer.');
  const bytes = new Uint8Array(buffer);
  const v2 = parseId3v2(bytes);
  const v1 = parseId3v1(bytes);
  const fields = { ...(v1?.fields || {}), ...(v2?.fields || {}) };
  return { v1, v2, fields, hasTag: Boolean(v1 || v2) };
}
