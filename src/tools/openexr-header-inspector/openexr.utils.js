const COMPRESSIONS = ['None', 'RLE', 'ZIPS', 'ZIP', 'PIZ', 'PXR24', 'B44', 'B44A', 'DWAA', 'DWAB'];
const LINE_ORDERS = ['Increasing Y', 'Decreasing Y', 'Random Y'];
const PIXEL_TYPES = ['UINT', 'HALF', 'FLOAT'];

function readString(view, cursor, end) {
  const start = cursor.offset;
  while (cursor.offset < end && view.getUint8(cursor.offset) !== 0) cursor.offset += 1;
  if (cursor.offset === end) throw new Error('Truncated file: missing string terminator.');
  const bytes = new Uint8Array(view.buffer, view.byteOffset + start, cursor.offset - start);
  cursor.offset += 1;
  return new TextDecoder('latin1').decode(bytes);
}

function decodeValue(view, type, start, size) {
  const end = start + size;
  const exact = (expected) => {
    if (size !== expected) throw new Error(`Invalid ${type} attribute size.`);
  };
  if (type === 'chlist') {
    const channels = [];
    const cursor = { offset: start };
    while (cursor.offset < end) {
      const name = readString(view, cursor, end);
      if (!name) {
        if (cursor.offset !== end) throw new Error('Invalid channel list size.');
        return channels;
      }
      if (end - cursor.offset < 16) throw new Error('Truncated channel list.');
      const pixelType = view.getInt32(cursor.offset, true);
      channels.push({
        name,
        pixelType: PIXEL_TYPES[pixelType] ?? `Unknown (${pixelType})`,
        linear: view.getUint8(cursor.offset + 4) !== 0,
        xSampling: view.getInt32(cursor.offset + 8, true),
        ySampling: view.getInt32(cursor.offset + 12, true),
      });
      cursor.offset += 16;
    }
    throw new Error('Truncated channel list: missing terminator.');
  }
  if (type === 'compression' || type === 'lineOrder') {
    exact(1);
    const value = view.getUint8(start);
    return (type === 'compression' ? COMPRESSIONS : LINE_ORDERS)[value] ?? `Unknown (${value})`;
  }
  if (type === 'box2i') {
    exact(16);
    return {
      xMin: view.getInt32(start, true), yMin: view.getInt32(start + 4, true),
      xMax: view.getInt32(start + 8, true), yMax: view.getInt32(start + 12, true),
    };
  }
  if (type === 'float') {
    exact(4);
    return view.getFloat32(start, true);
  }
  return null;
}

/**
 * Parse OpenEXR headers without decoding pixel data.
 * @param {ArrayBuffer} buffer File contents.
 * @returns {object} Version, flags, and header attributes for each part.
 */
export function parseOpenExr(buffer) {
  const view = new DataView(buffer);
  if (view.byteLength < 8) throw new Error('Truncated file: missing OpenEXR header.');
  if (view.getUint32(0, true) !== 0x01312f76) throw new Error('Bad OpenEXR magic number.');
  const versionField = view.getUint32(4, true);
  const version = versionField & 0xff;
  if (version !== 2) throw new Error(`Unsupported OpenEXR version: ${version}.`);
  const flags = {
    tiled: Boolean(versionField & 0x200),
    longNames: Boolean(versionField & 0x400),
    nonImage: Boolean(versionField & 0x800),
    multipart: Boolean(versionField & 0x1000),
  };
  const cursor = { offset: 8 };
  const headers = [];
  do {
    const attributes = [];
    while (true) {
      const name = readString(view, cursor, view.byteLength);
      if (!name) break;
      const type = readString(view, cursor, view.byteLength);
      if (view.byteLength - cursor.offset < 4) {
        throw new Error('Truncated file: missing attribute size.');
      }
      const size = view.getUint32(cursor.offset, true);
      cursor.offset += 4;
      if (size > view.byteLength - cursor.offset) {
        throw new Error(`Attribute "${name}" size runs past the end of the file.`);
      }
      attributes.push({ name, type, size, value: decodeValue(view, type, cursor.offset, size) });
      cursor.offset += size;
    }
    headers.push(attributes);
    if (!flags.multipart) break;
    if (cursor.offset >= view.byteLength) {
      throw new Error('Truncated file: missing multipart terminator.');
    }
    if (view.getUint8(cursor.offset) === 0) break;
  } while (flags.multipart);
  return { version, flags, headers };
}
