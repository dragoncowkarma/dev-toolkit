const HEIF_BRANDS = new Set(['heic', 'heix', 'heim', 'heis', 'mif1', 'msf1']);
const MAX_SAFE_UINT64 = Number.MAX_SAFE_INTEGER;

function fourCC(view, offset) {
  let value = '';
  for (let index = 0; index < 4; index += 1) {
    value += String.fromCharCode(view.getUint8(offset + index));
  }
  return value;
}

function uint64(view, offset) {
  const high = view.getUint32(offset);
  const low = view.getUint32(offset + 4);
  const value = high * 0x100000000 + low;
  if (value > MAX_SAFE_UINT64) {
    throw new Error('A 64-bit box size exceeds the browser-safe integer range.');
  }
  return value;
}

function createBox(view, offset, limit) {
  if (limit - offset < 8) {
    throw new Error(`Truncated box header at byte ${offset}.`);
  }
  const declaredSize = view.getUint32(offset);
  const type = fourCC(view, offset + 4);
  const headerSize = declaredSize === 1 ? 16 : 8;
  if (limit - offset < headerSize) {
    throw new Error(`Truncated extended-size header for ${type} at byte ${offset}.`);
  }
  const size = declaredSize === 1 ? uint64(view, offset + 8) : declaredSize || limit - offset;
  if (size < headerSize || size > limit - offset) {
    throw new Error(`Invalid ${type} box size at byte ${offset}.`);
  }
  return {
    type,
    offset,
    size,
    headerSize,
    dataOffset: offset + headerSize,
    end: offset + size,
    children: [],
  };
}

function readBoxes(view, start, end) {
  const boxes = [];
  let offset = start;
  while (offset < end) {
    const box = createBox(view, offset, end);
    boxes.push(box);
    offset = box.end;
  }
  return boxes;
}

function readFullBox(view, box) {
  if (box.end - box.dataOffset < 4) {
    throw new Error(`Truncated full box header in ${box.type}.`);
  }
  return { version: view.getUint8(box.dataOffset), dataOffset: box.dataOffset + 4 };
}

function parseItemInfo(view, box, summary) {
  const { version, dataOffset } = readFullBox(view, box);
  const countLength = version === 0 ? 2 : 4;
  if (box.end - dataOffset < countLength) {
    throw new Error('Truncated iinf entry count.');
  }
  box.children = readBoxes(view, dataOffset + countLength, box.end);
  for (const entry of box.children.filter((child) => child.type === 'infe')) {
    const fullBox = readFullBox(view, entry);
    const itemIdLength = fullBox.version >= 3 ? 4 : 2;
    if (entry.end - fullBox.dataOffset < itemIdLength) {
      throw new Error('Truncated infe item identifier.');
    }
    const itemId = itemIdLength === 4
      ? view.getUint32(fullBox.dataOffset)
      : view.getUint16(fullBox.dataOffset);
    summary.items.push({ id: itemId, type: 'unknown' });
  }
}

function parsePrimaryItem(view, box, summary) {
  const { version, dataOffset } = readFullBox(view, box);
  const length = version === 0 ? 2 : 4;
  if (box.end - dataOffset < length) {
    throw new Error('Truncated pitm primary item identifier.');
  }
  summary.primaryItemId = length === 2 ? view.getUint16(dataOffset) : view.getUint32(dataOffset);
}

function parseImageProperty(view, box, summary) {
  if (box.type === 'ispe') {
    const { dataOffset } = readFullBox(view, box);
    if (box.end - dataOffset < 8) throw new Error('Truncated ispe dimensions.');
    if (!summary.dimensions) {
      summary.dimensions = {
        width: view.getUint32(dataOffset),
        height: view.getUint32(dataOffset + 4),
      };
    }
  }
  if (box.type === 'irot') {
    const { dataOffset } = readFullBox(view, box);
    if (box.end - dataOffset < 1) throw new Error('Truncated irot rotation value.');
    summary.rotation = (view.getUint8(dataOffset) & 3) * 90;
  }
}

function parseMeta(view, box, summary) {
  const { dataOffset } = readFullBox(view, box);
  box.children = readBoxes(view, dataOffset, box.end);
  for (const child of box.children) {
    if (child.type === 'pitm') parsePrimaryItem(view, child, summary);
    if (child.type === 'iinf') parseItemInfo(view, child, summary);
    if (child.type === 'iloc') readFullBox(view, child);
    if (child.type === 'iprp') {
      child.children = readBoxes(view, child.dataOffset, child.end);
      for (const propertyContainer of child.children) {
        if (propertyContainer.type === 'ipco') {
          propertyContainer.children = readBoxes(
            view, propertyContainer.dataOffset, propertyContainer.end
          );
          propertyContainer.children.forEach((property) => {
            parseImageProperty(view, property, summary);
          });
        }
        if (propertyContainer.type === 'ipma') readFullBox(view, propertyContainer);
      }
    }
  }
}

function parseFileType(view, box, summary) {
  if (box.end - box.dataOffset < 8) throw new Error('Truncated ftyp box.');
  summary.majorBrand = fourCC(view, box.dataOffset);
  for (let offset = box.dataOffset + 8; offset + 4 <= box.end; offset += 4) {
    summary.compatibleBrands.push(fourCC(view, offset));
  }
}

/**
 * Parses a HEIF/HEIC ISOBMFF header without reading image payload bytes.
 * @param {ArrayBuffer|Uint8Array} input - File data to inspect.
 * @returns {object} Parsed header details, including a status and box tree.
 */
export function parseHeifHeader(input) {
  const empty = { ok: false, error: '', boxes: [], compatibleBrands: [], items: [] };
  try {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    if (bytes.byteLength < 8) {
      return { ...empty, error: 'File is too short to contain an ISOBMFF box.' };
    }
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const summary = { ...empty, boxes: readBoxes(view, 0, view.byteLength) };
    const fileType = summary.boxes.find((box) => box.type === 'ftyp');
    if (!fileType) {
      return { ...summary, error: 'Missing ftyp box; this is not a recognizable HEIF/HEIC file.' };
    }
    parseFileType(view, fileType, summary);
    if (!HEIF_BRANDS.has(summary.majorBrand)) {
      return {
        ...summary,
        error: `Unsupported brand: ${summary.majorBrand}. This is not a HEIF/HEIC family file.`,
      };
    }
    const meta = summary.boxes.find((box) => box.type === 'meta');
    if (meta) parseMeta(view, meta, summary);
    return { ...summary, ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to parse this file.';
    return { ...empty, error: message };
  }
}
