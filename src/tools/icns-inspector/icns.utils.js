const PNG_TYPES = {
  icp4: 16,
  icp5: 32,
  icp6: 64,
  ic07: 128,
  ic08: 256,
  ic09: 512,
  ic10: 1024,
  ic11: 32,
  ic12: 64,
  ic13: 256,
};

const LEGACY_IMAGES = {
  is32: 16,
  il32: 32,
  ih32: 48,
  it32: 128,
};

const LEGACY_MASKS = {
  s8mk: 16,
  l8mk: 32,
  h8mk: 48,
  t8mk: 128,
};

const STRUCTURAL_TYPES = {
  'TOC ': 'Table of contents',
  icnV: 'Version information',
};

function readType(view, offset) {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3)
  );
}

/**
 * Describes a known ICNS entry type without looking at its payload.
 *
 * @param {string} type - Four-character ICNS OSType.
 * @returns {{label: string, dimensions: string | null, format: string, isImage: boolean}}
 */
export function describeIcnsType(type) {
  if (Object.hasOwn(STRUCTURAL_TYPES, type)) {
    return {
      label: STRUCTURAL_TYPES[type],
      dimensions: null,
      format: 'Container metadata',
      isImage: false,
    };
  }

  if (Object.hasOwn(PNG_TYPES, type)) {
    const size = PNG_TYPES[type];
    return {
      label: 'PNG icon',
      dimensions: `${size} × ${size}`,
      format: 'PNG',
      isImage: true,
    };
  }

  if (Object.hasOwn(LEGACY_IMAGES, type)) {
    const size = LEGACY_IMAGES[type];
    return {
      label: 'Legacy color icon',
      dimensions: `${size} × ${size}`,
      format: 'Legacy raw/RLE RGB',
      isImage: true,
    };
  }

  if (Object.hasOwn(LEGACY_MASKS, type)) {
    const size = LEGACY_MASKS[type];
    return {
      label: 'Legacy alpha mask',
      dimensions: `${size} × ${size}`,
      format: 'Legacy raw alpha mask',
      isImage: false,
    };
  }

  return {
    label: 'Unknown entry',
    dimensions: null,
    format: 'Unknown',
    isImage: false,
  };
}

/**
 * Parses an ICNS container header and its type-length-value entries.
 * The parser returns errors and warnings rather than throwing for malformed data.
 *
 * @param {ArrayBuffer} buffer - Raw bytes from an ICNS file.
 * @returns {{entries: Array, warnings: string[], error: string | null, declaredLength: number | null}}
 */
export function parseIcns(buffer) {
  const view = new DataView(buffer);
  const warnings = [];
  const result = { entries: [], warnings, error: null, declaredLength: null };

  if (view.byteLength < 8) {
    result.error = `Truncated ICNS header: expected 8 bytes, found ${view.byteLength}.`;
    return result;
  }

  const magic = readType(view, 0);
  if (magic !== 'icns') {
    result.error = `Invalid ICNS magic: expected "icns", found "${magic}".`;
    return result;
  }

  const declaredLength = view.getUint32(4, false);
  result.declaredLength = declaredLength;
  if (declaredLength < 8) {
    result.error = `Invalid ICNS length: ${declaredLength} bytes is smaller than the header.`;
    return result;
  }

  if (declaredLength !== view.byteLength) {
    warnings.push(
      `Header declares ${declaredLength} bytes, but the selected file contains ${view.byteLength} bytes.`
    );
  }

  const containerEnd = Math.min(declaredLength, view.byteLength);
  let offset = 8;
  while (offset < containerEnd) {
    const remaining = containerEnd - offset;
    if (remaining < 8) {
      warnings.push(`Truncated entry header at byte ${offset}: ${remaining} bytes remain.`);
      break;
    }

    const type = readType(view, offset);
    const length = view.getUint32(offset + 4, false);
    const description = describeIcnsType(type);
    const entry = { type, length, offset, warning: null, ...description };
    result.entries.push(entry);

    if (length < 8) {
      entry.warning = `Invalid entry length ${length}; an ICNS entry must be at least 8 bytes.`;
      warnings.push(`${type} at byte ${offset}: ${entry.warning}`);
      break;
    }

    if (length > remaining) {
      entry.warning = `Entry length ${length} exceeds the ${remaining} bytes remaining in the container.`;
      warnings.push(`${type} at byte ${offset}: ${entry.warning}`);
      break;
    }

    offset += length;
  }

  return result;
}
