const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);

function parseError(message) {
  return new Error(`Invalid AVIF file: ${message}`);
}

function assertRange(view, offset, length, context) {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0 ||
    offset + length > view.byteLength) {
    throw parseError(`${context} is truncated or extends beyond the file bounds.`);
  }
}

function readFourCC(view, offset, context) {
  assertRange(view, offset, 4, context);
  return String.fromCharCode(
    view.getUint8(offset), view.getUint8(offset + 1), view.getUint8(offset + 2),
    view.getUint8(offset + 3)
  );
}

function readUnsigned(view, offset, length, context) {
  assertRange(view, offset, length, context);
  if (length === 0) return 0;
  if (length > 8) throw parseError(`${context} uses an unsupported ${length}-byte integer.`);
  let value = 0n;
  for (let index = 0; index < length; index += 1) {
    value = (value << 8n) | BigInt(view.getUint8(offset + index));
  }
  if (value > MAX_SAFE_BIGINT) {
    throw parseError(`${context} exceeds the browser-safe integer range.`);
  }
  return Number(value);
}

function readCString(view, offset, end, context) {
  const bytes = [];
  let cursor = offset;
  while (cursor < end && view.getUint8(cursor) !== 0) {
    bytes.push(view.getUint8(cursor));
    cursor += 1;
  }
  if (cursor === end) throw parseError(`${context} is missing a terminating zero byte.`);
  return new TextDecoder().decode(new Uint8Array(bytes));
}

function readBoxes(view, start, end, context) {
  assertRange(view, start, end - start, context);
  const boxes = [];
  let cursor = start;
  while (cursor < end) {
    assertRange(view, cursor, 8, `${context} box header`);
    const size32 = view.getUint32(cursor);
    const type = readFourCC(view, cursor + 4, `${context} box type`);
    let headerSize = 8;
    let size = size32;
    if (size32 === 1) {
      size = readUnsigned(view, cursor + 8, 8, `${type} extended box size`);
      headerSize = 16;
    } else if (size32 === 0) {
      size = end - cursor;
    }
    if (size < headerSize) throw parseError(`${type} box size is smaller than its header.`);
    if (cursor + size > end) throw parseError(`${type} box extends beyond its parent bounds.`);
    boxes.push({
      type, offset: cursor, size, headerSize, dataOffset: cursor + headerSize, end: cursor + size,
    });
    cursor += size;
  }
  return boxes;
}

function parseFtyp(view, box) {
  assertRange(view, box.dataOffset, 8, 'ftyp box');
  const majorBrand = readFourCC(view, box.dataOffset, 'ftyp major brand');
  const minorVersion = view.getUint32(box.dataOffset + 4);
  const compatibleBrands = [];
  for (let cursor = box.dataOffset + 8; cursor < box.end; cursor += 4) {
    compatibleBrands.push(readFourCC(view, cursor, 'ftyp compatible brand'));
  }
  if ((box.end - box.dataOffset - 8) % 4 !== 0) {
    throw parseError('ftyp compatible brands are incomplete.');
  }
  if (majorBrand !== 'avif' && majorBrand !== 'avis') {
    throw parseError(
      `ftyp major brand must be avif or avis, received ${JSON.stringify(majorBrand)}.`
    );
  }
  return { majorBrand, minorVersion, compatibleBrands };
}

function parseInfe(view, box) {
  assertRange(view, box.dataOffset, 8, 'infe box');
  const version = view.getUint8(box.dataOffset);
  if (version < 2) return null;
  let cursor = box.dataOffset + 4;
  const itemIdLength = version === 2 ? 2 : 4;
  const itemId = readUnsigned(view, cursor, itemIdLength, 'infe item ID');
  cursor += itemIdLength + 2;
  const itemType = readFourCC(view, cursor, 'infe item type');
  cursor += 4;
  const name = readCString(view, cursor, box.end, 'infe item name');
  return { itemId, itemType, name };
}

function parseIinf(view, box) {
  assertRange(view, box.dataOffset, 6, 'iinf box');
  const version = view.getUint8(box.dataOffset);
  const countLength = version === 0 ? 2 : 4;
  const entryCount = readUnsigned(view, box.dataOffset + 4, countLength, 'iinf entry count');
  const children = readBoxes(view, box.dataOffset + 4 + countLength, box.end, 'iinf');
  const items = children.filter((child) => child.type === 'infe')
    .map((child) => parseInfe(view, child)).filter(Boolean);
  if (items.length < entryCount) throw parseError('iinf declares more entries than are present.');
  return items;
}

function parseIloc(view, box) {
  assertRange(view, box.dataOffset, 6, 'iloc box');
  const version = view.getUint8(box.dataOffset);
  const sizes = view.getUint8(box.dataOffset + 4);
  const offsetSize = sizes >> 4;
  const lengthSize = sizes & 15;
  const baseOffsetSize = view.getUint8(box.dataOffset + 5) >> 4;
  const indexSize = version === 1 || version === 2
    ? view.getUint8(box.dataOffset + 5) & 15 : 0;
  let cursor = box.dataOffset + 6;
  const itemCountLength = version < 2 ? 2 : 4;
  const itemCount = readUnsigned(view, cursor, itemCountLength, 'iloc item count');
  cursor += itemCountLength;
  const locations = [];
  for (let index = 0; index < itemCount; index += 1) {
    const itemId = readUnsigned(view, cursor, version < 2 ? 2 : 4, 'iloc item ID');
    cursor += version < 2 ? 2 : 4;
    if (version === 1 || version === 2) cursor += 2;
    cursor += 2;
    const baseOffset = readUnsigned(view, cursor, baseOffsetSize, 'iloc base offset');
    cursor += baseOffsetSize;
    const extentCount = readUnsigned(view, cursor, 2, 'iloc extent count');
    cursor += 2;
    const extents = [];
    for (let extent = 0; extent < extentCount; extent += 1) {
      if ((version === 1 || version === 2) && indexSize > 0) cursor += indexSize;
      const offset = readUnsigned(view, cursor, offsetSize, 'iloc extent offset');
      cursor += offsetSize;
      const length = readUnsigned(view, cursor, lengthSize, 'iloc extent length');
      cursor += lengthSize;
      extents.push({ offset: baseOffset + offset, length });
    }
    locations.push({ itemId, extents });
  }
  if (cursor > box.end) throw parseError('iloc entries extend beyond the box bounds.');
  return locations;
}

function parseProperty(view, box) {
  if (box.type === 'ispe') {
    assertRange(view, box.dataOffset, 12, 'ispe property');
    return {
      type: 'ispe',
      width: view.getUint32(box.dataOffset + 4),
      height: view.getUint32(box.dataOffset + 8),
    };
  }
  if (box.type === 'pixi') {
    assertRange(view, box.dataOffset, 5, 'pixi property');
    const count = view.getUint8(box.dataOffset + 4);
    assertRange(view, box.dataOffset + 5, count, 'pixi bit-depth values');
    return {
      type: 'pixi',
      bits: Array.from({ length: count }, (_, index) => view.getUint8(box.dataOffset + 5 + index)),
    };
  }
  if (box.type === 'auxC') {
    assertRange(view, box.dataOffset, 4, 'auxC property');
    return {
      type: 'auxC',
      auxiliaryType: readCString(view, box.dataOffset + 4, box.end, 'auxC type'),
    };
  }
  return { type: box.type };
}

function parseIpma(view, box) {
  assertRange(view, box.dataOffset, 8, 'ipma box');
  const flags = (view.getUint8(box.dataOffset + 1) << 16) |
    (view.getUint8(box.dataOffset + 2) << 8) | view.getUint8(box.dataOffset + 3);
  let cursor = box.dataOffset + 4;
  const count = readUnsigned(view, cursor, 4, 'ipma entry count');
  cursor += 4;
  const associations = new Map();
  for (let entry = 0; entry < count; entry += 1) {
    const itemId = readUnsigned(view, cursor, flags & 1 ? 4 : 2, 'ipma item ID');
    cursor += flags & 1 ? 4 : 2;
    const associationCount = readUnsigned(view, cursor, 1, 'ipma association count');
    cursor += 1;
    const indices = [];
    for (let index = 0; index < associationCount; index += 1) {
      const value = readUnsigned(view, cursor, flags & 1 ? 2 : 1, 'ipma property association');
      cursor += flags & 1 ? 2 : 1;
      indices.push(flags & 1 ? value & 0x7fff : value & 0x7f);
    }
    associations.set(itemId, indices);
  }
  if (cursor > box.end) throw parseError('ipma associations extend beyond the box bounds.');
  return associations;
}

function parseMeta(view, box) {
  assertRange(view, box.dataOffset, 4, 'meta box');
  const children = readBoxes(view, box.dataOffset + 4, box.end, 'meta');
  const handler = children.find((child) => child.type === 'hdlr');
  let handlerType = null;
  if (handler) {
    assertRange(view, handler.dataOffset, 12, 'hdlr box');
    handlerType = readFourCC(view, handler.dataOffset + 8, 'hdlr handler type');
  }
  const items = children.filter((child) => child.type === 'iinf')
    .flatMap((child) => parseIinf(view, child));
  const locations = children.filter((child) => child.type === 'iloc')
    .flatMap((child) => parseIloc(view, child));
  const iprp = children.find((child) => child.type === 'iprp');
  let properties = [];
  let associations = new Map();
  if (iprp) {
    const propertyBoxes = readBoxes(view, iprp.dataOffset, iprp.end, 'iprp');
    const ipco = propertyBoxes.find((child) => child.type === 'ipco');
    if (ipco) {
      properties = readBoxes(view, ipco.dataOffset, ipco.end, 'ipco')
        .map((child) => parseProperty(view, child));
    }
    const ipma = propertyBoxes.find((child) => child.type === 'ipma');
    if (ipma) associations = parseIpma(view, ipma);
  }
  return { handlerType, items, locations, properties, associations };
}

/**
 * Parses an AVIF/AVIS ISOBMFF container entirely from browser-provided bytes.
 * @param {ArrayBuffer} buffer
 * @returns {object} Parsed brand, boxes, item metadata, and resolved image summary.
 */
export function parseAvif(buffer) {
  if (!(buffer instanceof ArrayBuffer)) throw new TypeError('Expected an ArrayBuffer.');
  const view = new DataView(buffer);
  if (view.byteLength < 8) {
    throw parseError('file is too small to contain an ISOBMFF box.');
  }
  const boxes = readBoxes(view, 0, view.byteLength, 'file');
  const ftyp = boxes.find((box) => box.type === 'ftyp');
  if (!ftyp) throw parseError('missing required ftyp box.');
  const brand = parseFtyp(view, ftyp);
  const meta = boxes.find((box) => box.type === 'meta');
  const details = meta ? parseMeta(view, meta) : {
    handlerType: null, items: [], locations: [], properties: [], associations: new Map(),
  };
  const spatial = details.properties.find((property) => property.type === 'ispe');
  const pixelInfo = details.properties.find((property) => property.type === 'pixi');
  const alphaByType = details.items.some((item) => item.itemType === 'auxl');
  const alphaByProperty = [...details.associations.entries()].some(([, indices]) =>
    indices.some((index) => details.properties[index - 1]?.type === 'auxC' &&
      details.properties[index - 1].auxiliaryType.includes('alpha'))
  );
  return {
    ...brand,
    boxes: boxes.map(({ type, offset, size }) => ({ type, offset, size })),
    handlerType: details.handlerType,
    items: details.items.map((item) => ({
      ...item,
      locations: details.locations.find(
        (location) => location.itemId === item.itemId
      )?.extents ?? [],
    })),
    properties: details.properties,
    summary: {
      width: spatial?.width ?? null,
      height: spatial?.height ?? null,
      bitDepth: pixelInfo ? Math.max(...pixelInfo.bits) : null,
      hasAlpha: alphaByType || alphaByProperty,
      isSequence: brand.majorBrand === 'avis',
    },
  };
}
