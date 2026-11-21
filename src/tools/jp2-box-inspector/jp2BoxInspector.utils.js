const JP2_SIGNATURE_TYPE = 'jP  ';
const JP2_SIGNATURE_MAGIC = 0x0d0a870a;
const J2K_SOC_MARKER = 0xff4f;
const J2K_SIZ_MARKER = 0xff51;
const MAX_SAFE_BOX_LENGTH = Number.MAX_SAFE_INTEGER;
const MAX_BOX_COUNT = 4096;

const BOX_LABELS = {
  'jP  ': 'JP2 Signature Box',
  ftyp: 'File Type Box',
  jp2h: 'JP2 Header Superbox',
  ihdr: 'Image Header Box',
  bpcc: 'Bits Per Component Box',
  colr: 'Colour Specification Box',
  pclr: 'Palette Box',
  cmap: 'Component Mapping Box',
  cdef: 'Channel Definition Box',
  'res ': 'Resolution Superbox',
  resc: 'Capture Resolution Box',
  resd: 'Default Display Resolution Box',
  jp2c: 'Contiguous Codestream Box',
  jp2i: 'Intellectual Property Box',
  'xml ': 'XML Box',
  uuid: 'UUID Box',
  uinf: 'UUID Info Superbox',
  ulst: 'UUID List Box',
  'url ': 'Data Entry URL Box',
};

const ENUM_COLOURSPACES = {
  12: 'CMYK',
  14: 'CIELab',
  16: 'sRGB',
  17: 'Greyscale',
  18: 'sYCC',
  20: 'e-sRGB',
  21: 'ROMM-RGB',
};

/**
 * Formats a byte count into a human-readable string (e.g. "1.2 KB").
 *
 * @param {number} bytes - Raw byte count.
 * @returns {string} Formatted byte size label.
 */
export function formatByteSize(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return '0 B';
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

/**
 * Reads a browser File or Blob into a Uint8Array using FileReader.
 *
 * @param {File|Blob} file - The local file to read.
 * @returns {Promise<Uint8Array>} Resolves with the raw file bytes.
 */
export function readFileAsUint8Array(file) {
  return new Promise((resolve, reject) => {
    if (!file || typeof file !== 'object') {
      reject(new Error('No valid file selected.'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(new Uint8Array(reader.result));
      } else {
        reject(new Error('Failed to read the selected file as binary data.'));
      }
    };
    reader.onerror = () => {
      reject(new Error('Failed to read the selected file.'));
    };
    reader.readAsArrayBuffer(file);
  });
}

function normalizeBytes(input) {
  if (input instanceof Uint8Array) {
    return input;
  }
  if (input instanceof ArrayBuffer) {
    return new Uint8Array(input);
  }
  if (ArrayBuffer.isView(input)) {
    return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  }
  return null;
}

function readFourCC(bytes, offset) {
  let text = '';
  let printable = true;
  for (let i = 0; i < 4; i += 1) {
    const code = bytes[offset + i];
    if (code < 0x20 || code > 0x7e) {
      printable = false;
    }
    text += String.fromCharCode(code);
  }
  if (printable) {
    return text;
  }
  const hex = Array.from(bytes.subarray(offset, offset + 4))
    .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
    .join('');
  return `0x${hex}`;
}

function formatHexBytes(bytes, start, length) {
  const end = Math.min(bytes.length, start + length);
  return Array.from(bytes.subarray(start, end))
    .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
    .join(' ');
}

function decodeBpcByte(bpcByte) {
  if (bpcByte === 0xff) {
    return {
      rawByte: bpcByte,
      variesByComponent: true,
      bitDepth: null,
      isSigned: false,
    };
  }
  return {
    rawByte: bpcByte,
    variesByComponent: false,
    bitDepth: (bpcByte & 0x7f) + 1,
    isSigned: (bpcByte & 0x80) !== 0,
  };
}

function parseBoxHeader(view, bytes, offset, rangeEnd) {
  const remaining = rangeEnd - offset;
  if (remaining < 8) {
    return {
      error: `Truncated box header at offset ${offset} (${remaining} bytes remaining).`,
    };
  }

  const lBox = view.getUint32(offset, false);
  const type = readFourCC(bytes, offset + 4);

  if (lBox === 0) {
    return {
      type,
      offset,
      headerSize: 8,
      length: remaining,
      payloadOffset: offset + 8,
      payloadLength: remaining - 8,
      lengthMode: 'to-eof',
      declaredLength: 0,
    };
  }

  if (lBox === 1) {
    if (remaining < 16) {
      return {
        error:
          `Truncated 64-bit extended box header for "${type}" at offset ${offset} ` +
          `(${remaining} bytes remaining).`,
      };
    }
    const high = view.getUint32(offset + 8, false);
    const low = view.getUint32(offset + 12, false);
    if (high > 0x001fffff) {
      return {
        error:
          `Oversized 64-bit box length for "${type}" at offset ${offset} ` +
          '(exceeds safe integer limit).',
      };
    }
    const xlBox = high * 0x100000000 + low;
    if (xlBox < 16) {
      return {
        error:
          `Invalid 64-bit extended box length (${xlBox}) for "${type}" at offset ${offset} ` +
          '(must be at least 16 bytes).',
      };
    }
    if (xlBox > remaining || xlBox > MAX_SAFE_BOX_LENGTH) {
      return {
        error:
          `Box "${type}" at offset ${offset} declares 64-bit length ${xlBox} B, ` +
          `exceeding available ${remaining} B.`,
      };
    }
    return {
      type,
      offset,
      headerSize: 16,
      length: xlBox,
      payloadOffset: offset + 16,
      payloadLength: xlBox - 16,
      lengthMode: '64-bit',
      declaredLength: xlBox,
    };
  }

  if (lBox < 8) {
    return {
      error:
        `Invalid box length (${lBox}) for "${type}" at offset ${offset} ` +
        '(must be 0, 1, or >= 8).',
    };
  }

  if (lBox > remaining) {
    return {
      error:
        `Truncated or oversized box "${type}" at offset ${offset}: ` +
        `declares ${lBox} B, only ${remaining} B available.`,
    };
  }

  return {
    type,
    offset,
    headerSize: 8,
    length: lBox,
    payloadOffset: offset + 8,
    payloadLength: lBox - 8,
    lengthMode: '32-bit',
    declaredLength: lBox,
  };
}

function decodeFtypBox(view, bytes, box, errors, warnings) {
  const { payloadOffset, payloadLength } = box;
  if (payloadLength < 8) {
    errors.push(
      `File Type box (ftyp) is truncated: expected at least 8 bytes, got ${payloadLength}.`
    );
    return null;
  }

  const brand = readFourCC(bytes, payloadOffset);
  const minorVersion = view.getUint32(payloadOffset + 4, false);
  const rem = payloadLength - 8;
  if (rem % 4 !== 0) {
    warnings.push(
      `File Type box (ftyp) has ${rem % 4} trailing non-aligned byte(s) in compatibility list.`
    );
  }

  const compatibilityList = [];
  const count = Math.floor(rem / 4);
  for (let i = 0; i < count; i += 1) {
    compatibilityList.push(readFourCC(bytes, payloadOffset + 8 + i * 4));
  }

  if (brand !== 'jp2 ' && !compatibilityList.includes('jp2 ')) {
    warnings.push(
      'File Type box (ftyp) does not include standard "jp2 " in brand or compatibility list.'
    );
  }

  return {
    brand,
    minorVersion,
    compatibilityList,
  };
}

function decodeIhdrBox(view, box, errors) {
  const { payloadOffset, payloadLength } = box;
  if (payloadLength < 14) {
    errors.push(
      `Image Header box (ihdr) is truncated: expected 14 bytes, got ${payloadLength}.`
    );
    return null;
  }

  const height = view.getUint32(payloadOffset, false);
  const width = view.getUint32(payloadOffset + 4, false);
  const componentCount = view.getUint16(payloadOffset + 8, false);
  const rawBpc = view.getUint8(payloadOffset + 10);
  const compressionType = view.getUint8(payloadOffset + 11);
  const unkC = view.getUint8(payloadOffset + 12);
  const ipr = view.getUint8(payloadOffset + 13);

  if (width === 0 || height === 0) {
    errors.push(`Image Header box (ihdr) specifies invalid zero dimensions (${width}x${height}).`);
  }
  if (componentCount === 0) {
    errors.push('Image Header box (ihdr) specifies zero image components.');
  }

  const bpcInfo = decodeBpcByte(rawBpc);

  return {
    width,
    height,
    componentCount,
    bitsPerComponent: bpcInfo.bitDepth,
    isSigned: bpcInfo.isSigned,
    variesByComponent: bpcInfo.variesByComponent,
    rawBpc,
    compressionType,
    compressionName:
      compressionType === 7
        ? 'Wavelet / JPEG 2000 (7)'
        : `Custom / Unknown (${compressionType})`,
    colourspaceUnknown: unkC === 1,
    unknownColourspaceFlag: unkC,
    hasIntellectualProperty: ipr === 1,
    iprFlag: ipr,
  };
}

function decodeBpccBox(bytes, box, expectedCount, errors, warnings) {
  const { payloadOffset, payloadLength } = box;
  if (payloadLength === 0) {
    errors.push('Bits Per Component box (bpcc) has an empty payload.');
    return [];
  }
  if (expectedCount !== null && payloadLength < expectedCount) {
    errors.push(
      `Bits Per Component box (bpcc) is truncated: expected ${expectedCount} component ` +
        `entry byte(s), found ${payloadLength}.`
    );
  } else if (expectedCount !== null && payloadLength > expectedCount) {
    warnings.push(
      `Bits Per Component box (bpcc) contains ${payloadLength} bytes for ` +
        `${expectedCount} declared component(s).`
    );
  }

  const entries = [];
  for (let i = 0; i < payloadLength; i += 1) {
    const rawByte = bytes[payloadOffset + i];
    entries.push({
      index: i,
      bitDepth: (rawByte & 0x7f) + 1,
      isSigned: (rawByte & 0x80) !== 0,
      rawByte,
    });
  }
  return entries;
}

function decodeIccHeaderSummary(view, bytes, iccOffset, iccLength) {
  const summary = {
    byteLength: iccLength,
    declaredSize: null,
    colorSpaceSignature: null,
    pcsSignature: null,
    deviceClass: null,
    acspSignatureValid: null,
  };
  if (iccLength >= 4) {
    summary.declaredSize = view.getUint32(iccOffset, false);
  }
  if (iccLength >= 24) {
    summary.deviceClass = readFourCC(bytes, iccOffset + 12);
    summary.colorSpaceSignature = readFourCC(bytes, iccOffset + 16);
    summary.pcsSignature = readFourCC(bytes, iccOffset + 20);
  }
  if (iccLength >= 40) {
    summary.acspSignatureValid = readFourCC(bytes, iccOffset + 36) === 'acsp';
  }
  return summary;
}

function decodeColrBox(view, bytes, box, errors, warnings) {
  const { payloadOffset, payloadLength } = box;
  if (payloadLength < 3) {
    errors.push(
      `Colour Specification box (colr) is truncated: expected at least 3 bytes, ` +
        `got ${payloadLength}.`
    );
    return null;
  }

  const method = view.getUint8(payloadOffset);
  const precedence = view.getInt8(payloadOffset + 1);
  const approximation = view.getUint8(payloadOffset + 2);

  if (method === 1) {
    if (payloadLength < 7) {
      errors.push(
        `Enumerated Colour Specification box (colr) requires 7 bytes, got ${payloadLength}.`
      );
      return null;
    }
    const enumCS = view.getUint32(payloadOffset + 3, false);
    const enumName = ENUM_COLOURSPACES[enumCS] ?? `Unknown (${enumCS})`;
    if (!ENUM_COLOURSPACES[enumCS]) {
      warnings.push(
        `Colour Specification box (colr) uses unrecognized enumerated colourspace ${enumCS}.`
      );
    }
    return {
      method,
      methodName: 'Enumerated Colourspace',
      precedence,
      approximation,
      enumeratedColourspace: enumCS,
      enumeratedColourspaceName: enumName,
      iccProfileSize: 0,
      iccProfile: null,
    };
  }

  if (method === 2 || method === 3) {
    const iccLength = payloadLength - 3;
    if (iccLength <= 0) {
      errors.push('ICC Colour Specification box (colr) is missing ICC profile payload bytes.');
      return null;
    }
    const iccProfile = decodeIccHeaderSummary(view, bytes, payloadOffset + 3, iccLength);
    return {
      method,
      methodName: method === 2 ? 'Restricted ICC Profile' : 'Full ICC Profile (JPX)',
      precedence,
      approximation,
      enumeratedColourspace: null,
      enumeratedColourspaceName: null,
      iccProfileSize: iccLength,
      iccProfile,
    };
  }

  warnings.push(`Unsupported Colour Specification method (${method}) in colr box.`);
  return {
    method,
    methodName: `Unsupported Method (${method})`,
    precedence,
    approximation,
    enumeratedColourspace: null,
    enumeratedColourspaceName: null,
    iccProfileSize: payloadLength - 3,
    iccProfile: null,
  };
}

function decodeResolutionGridPayload(view, payloadOffset, payloadLength, boxType, errors) {
  if (payloadLength < 10) {
    errors.push(
      `Resolution box (${boxType}) is truncated: expected 10 bytes, got ${payloadLength}.`
    );
    return null;
  }

  const vrN = view.getUint16(payloadOffset, false);
  const vrD = view.getUint16(payloadOffset + 2, false);
  const hrN = view.getUint16(payloadOffset + 4, false);
  const hrD = view.getUint16(payloadOffset + 6, false);
  const vrE = view.getInt8(payloadOffset + 8);
  const hrE = view.getInt8(payloadOffset + 9);

  if (vrD === 0 || hrD === 0) {
    errors.push(`Resolution box (${boxType}) contains a zero denominator.`);
    return null;
  }

  const verticalPpm = (vrN / vrD) * 10 ** vrE;
  const horizontalPpm = (hrN / hrD) * 10 ** hrE;
  const verticalDpi = Number((verticalPpm * 0.0254).toFixed(2));
  const horizontalDpi = Number((horizontalPpm * 0.0254).toFixed(2));

  return {
    boxType,
    verticalNumerator: vrN,
    verticalDenominator: vrD,
    verticalExponent: vrE,
    horizontalNumerator: hrN,
    horizontalDenominator: hrD,
    horizontalExponent: hrE,
    verticalPpm: Number(verticalPpm.toFixed(2)),
    horizontalPpm: Number(horizontalPpm.toFixed(2)),
    verticalDpi,
    horizontalDpi,
  };
}

function parseResolutionSuperbox(view, bytes, resBox, errors, warnings) {
  const start = resBox.payloadOffset;
  const end = resBox.payloadOffset + resBox.payloadLength;

  if (resBox.payloadLength === 10) {
    const candidateType = readFourCC(bytes, start + 4);
    if (candidateType !== 'resc' && candidateType !== 'resd') {
      warnings.push(
        'Resolution box (res ) carries a direct 10-byte grid payload ' +
          'instead of resc/resd sub-boxes.'
      );
      const direct = decodeResolutionGridPayload(view, start, 10, 'res ', errors);
      return {
        capture: direct,
        display: null,
        children: [],
      };
    }
  }

  const children = [];
  let capture = null;
  let display = null;
  let cursor = start;
  let guard = 0;

  while (cursor < end && guard < MAX_BOX_COUNT) {
    guard += 1;
    const childHeader = parseBoxHeader(view, bytes, cursor, end);
    if (childHeader.error) {
      errors.push(childHeader.error);
      break;
    }

    const childNode = {
      ...childHeader,
      label: BOX_LABELS[childHeader.type] ?? 'Resolution Child Box',
      details: null,
      children: [],
    };

    if (childHeader.type === 'resc') {
      capture = decodeResolutionGridPayload(
        view,
        childHeader.payloadOffset,
        childHeader.payloadLength,
        'resc',
        errors
      );
      childNode.details = capture;
    } else if (childHeader.type === 'resd') {
      display = decodeResolutionGridPayload(
        view,
        childHeader.payloadOffset,
        childHeader.payloadLength,
        'resd',
        errors
      );
      childNode.details = display;
    } else {
      warnings.push(
        `Unexpected child box "${childHeader.type}" inside Resolution superbox (res ).`
      );
    }

    children.push(childNode);
    cursor += childHeader.length;
  }

  if (!capture && !display && children.length === 0 && errors.length === 0) {
    warnings.push('Resolution superbox (res ) contains no resc or resd child boxes.');
  }

  return {
    capture,
    display,
    children,
  };
}

function parseJp2HeaderSuperbox(view, bytes, jp2hBox, errors, warnings) {
  const start = jp2hBox.payloadOffset;
  const end = jp2hBox.payloadOffset + jp2hBox.payloadLength;
  const children = [];

  let imageHeader = null;
  let bitsPerComponent = null;
  const colourSpecifications = [];
  let resolution = null;

  let cursor = start;
  let guard = 0;

  while (cursor < end && guard < MAX_BOX_COUNT) {
    guard += 1;
    const childHeader = parseBoxHeader(view, bytes, cursor, end);
    if (childHeader.error) {
      errors.push(childHeader.error);
      break;
    }

    const childNode = {
      ...childHeader,
      label: BOX_LABELS[childHeader.type] ?? 'JP2 Header Child Box',
      details: null,
      children: [],
    };

    if (childHeader.type === 'ihdr') {
      if (imageHeader) {
        warnings.push('Multiple Image Header (ihdr) boxes found inside jp2h.');
      }
      imageHeader = decodeIhdrBox(view, childHeader, errors);
      childNode.details = imageHeader;
    } else if (childHeader.type === 'bpcc') {
      const expectedCount = imageHeader ? imageHeader.componentCount : null;
      bitsPerComponent = decodeBpccBox(bytes, childHeader, expectedCount, errors, warnings);
      childNode.details = { components: bitsPerComponent };
    } else if (childHeader.type === 'colr') {
      const colrInfo = decodeColrBox(view, bytes, childHeader, errors, warnings);
      if (colrInfo) {
        colourSpecifications.push(colrInfo);
        childNode.details = colrInfo;
      }
    } else if (childHeader.type === 'res ') {
      const resInfo = parseResolutionSuperbox(
        view,
        bytes,
        childHeader,
        errors,
        warnings
      );
      resolution = {
        capture: resInfo.capture,
        display: resInfo.display,
      };
      childNode.details = resolution;
      childNode.children = resInfo.children;
    }

    children.push(childNode);
    cursor += childHeader.length;
  }

  if (!imageHeader) {
    errors.push('JP2 Header superbox (jp2h) is missing the required Image Header (ihdr) box.');
  } else if (imageHeader.variesByComponent && !bitsPerComponent) {
    errors.push(
      'Image Header (ihdr) indicates variable component bit depths (BPC = 0xFF), ' +
        'but no Bits Per Component (bpcc) box was found in jp2h.'
    );
  }

  if (colourSpecifications.length === 0) {
    warnings.push(
      'JP2 Header superbox (jp2h) does not contain a Colour Specification (colr) box.'
    );
  }

  return {
    header: {
      imageHeader,
      bitsPerComponent,
      colourSpecification: colourSpecifications[0] ?? null,
      colourSpecifications,
      resolution,
    },
    children,
  };
}

function inspectRawCodestream(view, bytes) {
  let sizSummary = null;
  if (bytes.length >= 4 && view.getUint16(2, false) === J2K_SIZ_MARKER && bytes.length >= 42) {
    const lsiz = view.getUint16(4, false);
    if (lsiz >= 38 && bytes.length >= 4 + lsiz) {
      const xsiz = view.getUint32(8, false);
      const ysiz = view.getUint32(12, false);
      const xosiz = view.getUint32(16, false);
      const yosiz = view.getUint32(20, false);
      const csiz = view.getUint16(40, false);
      sizSummary = {
        width: Math.max(0, xsiz - xosiz),
        height: Math.max(0, ysiz - yosiz),
        componentCount: csiz,
      };
    }
  }

  return {
    isValid: true,
    format: 'J2K Codestream',
    isRawCodestream: true,
    containerAvailable: false,
    byteLength: bytes.length,
    signature: null,
    fileType: null,
    header: null,
    codestreamSummary: sizSummary,
    codestreamCount: 1,
    boxes: [],
    errors: [],
    warnings: [
      'Raw JPEG 2000 codestream detected (SOC marker 0xFF4F). ' +
        'JP2 container box metadata (ftyp, jp2h) is unavailable for raw .j2k/.j2c files.',
    ],
  };
}

/**
 * Parses a JPEG 2000 (.jp2, .j2k, .j2c) byte buffer and extracts container boxes and metadata.
 * Never throws on malformed or truncated binary inputs; all issues are returned in `errors`
 * and `warnings`.
 *
 * @param {ArrayBuffer|Uint8Array} input - Raw file bytes.
 * @returns {object} Structured JP2 inspection report.
 */
export function parseJp2Container(input) {
  const bytes = normalizeBytes(input);
  if (!bytes) {
    return {
      isValid: false,
      format: 'Unknown',
      isRawCodestream: false,
      containerAvailable: false,
      byteLength: 0,
      signature: null,
      fileType: null,
      header: null,
      codestreamSummary: null,
      codestreamCount: 0,
      boxes: [],
      errors: ['Input must be an ArrayBuffer or Uint8Array.'],
      warnings: [],
    };
  }

  if (bytes.length === 0) {
    return {
      isValid: false,
      format: 'Unknown',
      isRawCodestream: false,
      containerAvailable: false,
      byteLength: 0,
      signature: null,
      fileType: null,
      header: null,
      codestreamSummary: null,
      codestreamCount: 0,
      boxes: [],
      errors: ['File is empty (0 bytes).'],
      warnings: [],
    };
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  if (bytes.length >= 2 && view.getUint16(0, false) === J2K_SOC_MARKER) {
    return inspectRawCodestream(view, bytes);
  }

  const errors = [];
  const warnings = [];
  const boxes = [];

  if (bytes.length < 12) {
    errors.push(
      `File is too short (${bytes.length} bytes) to contain a valid 12-byte JP2 Signature box.`
    );
    return {
      isValid: false,
      format: 'Unknown',
      isRawCodestream: false,
      containerAvailable: false,
      byteLength: bytes.length,
      signature: null,
      fileType: null,
      header: null,
      codestreamSummary: null,
      codestreamCount: 0,
      boxes,
      errors,
      warnings,
    };
  }

  const sigLength = view.getUint32(0, false);
  const sigType = readFourCC(bytes, 4);
  const sigMagic = view.getUint32(8, false);
  const sigHex = formatHexBytes(bytes, 8, 4);
  const sigValid =
    sigLength === 12 && sigType === JP2_SIGNATURE_TYPE && sigMagic === JP2_SIGNATURE_MAGIC;

  const signature = {
    valid: sigValid,
    type: sigType,
    length: sigLength,
    hex: sigHex,
  };

  if (!sigValid) {
    errors.push(
      'Invalid JP2 Signature box: expected 12-byte "jP  " box with signature bytes ' +
        `0D 0A 87 0A (found type "${sigType}", length ${sigLength}, bytes ${sigHex}).`
    );
    return {
      isValid: false,
      format: 'Unknown',
      isRawCodestream: false,
      containerAvailable: false,
      byteLength: bytes.length,
      signature,
      fileType: null,
      header: null,
      codestreamSummary: null,
      codestreamCount: 0,
      boxes,
      errors,
      warnings,
    };
  }

  let fileType = null;
  let header = null;
  let codestreamCount = 0;
  let cursor = 0;
  let guard = 0;

  while (cursor < bytes.length && guard < MAX_BOX_COUNT) {
    guard += 1;
    const boxHeader = parseBoxHeader(view, bytes, cursor, bytes.length);
    if (boxHeader.error) {
      errors.push(boxHeader.error);
      break;
    }

    const boxNode = {
      ...boxHeader,
      label: BOX_LABELS[boxHeader.type] ?? 'Application / Unknown Box',
      details: null,
      children: [],
    };

    if (boxHeader.type === JP2_SIGNATURE_TYPE) {
      boxNode.details = signature;
    } else if (boxHeader.type === 'ftyp') {
      fileType = decodeFtypBox(view, bytes, boxHeader, errors, warnings);
      boxNode.details = fileType;
    } else if (boxHeader.type === 'jp2h') {
      const parsedHeader = parseJp2HeaderSuperbox(view, bytes, boxHeader, errors, warnings);
      header = parsedHeader.header;
      boxNode.details = header;
      boxNode.children = parsedHeader.children;
    } else if (boxHeader.type === 'jp2c') {
      codestreamCount += 1;
      const hasSoc =
        boxHeader.payloadLength >= 2 &&
        view.getUint16(boxHeader.payloadOffset, false) === J2K_SOC_MARKER;
      if (!hasSoc) {
        warnings.push(
          `Contiguous Codestream box (jp2c) at offset ${boxHeader.offset} ` +
            'does not start with SOC marker 0xFF4F.'
        );
      }
      boxNode.details = {
        codestreamBytes: boxHeader.payloadLength,
        startsWithSocMarker: hasSoc,
      };
    } else if (boxHeader.type === 'uuid' && boxHeader.payloadLength >= 16) {
      boxNode.details = {
        uuidHex: formatHexBytes(bytes, boxHeader.payloadOffset, 16),
      };
    }

    boxes.push(boxNode);
    cursor += boxHeader.length;
  }

  if (!fileType) {
    errors.push('Missing required File Type (ftyp) box.');
  }
  if (!header) {
    errors.push('Missing required JP2 Header superbox (jp2h).');
  }

  return {
    isValid: errors.length === 0,
    format: 'JP2',
    isRawCodestream: false,
    containerAvailable: true,
    byteLength: bytes.length,
    signature,
    fileType,
    header,
    codestreamSummary: null,
    codestreamCount,
    boxes,
    errors,
    warnings,
  };
}

function makeBox(type, payloadBytes, options = {}) {
  const typeBytes = new Uint8Array(4);
  for (let i = 0; i < 4; i += 1) {
    typeBytes[i] = type.charCodeAt(i) & 0xff;
  }

  if (options.extended) {
    const totalLength = 16 + payloadBytes.length;
    const out = new Uint8Array(totalLength);
    const view = new DataView(out.buffer);
    view.setUint32(0, 1, false);
    out.set(typeBytes, 4);
    view.setUint32(8, 0, false);
    view.setUint32(12, totalLength, false);
    out.set(payloadBytes, 16);
    return out;
  }

  const totalLength = 8 + payloadBytes.length;
  const out = new Uint8Array(totalLength);
  const view = new DataView(out.buffer);
  view.setUint32(0, options.toEof ? 0 : totalLength, false);
  out.set(typeBytes, 4);
  out.set(payloadBytes, 8);
  return out;
}

function concatBytes(arrays) {
  const total = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const arr of arrays) {
    out.set(arr, offset);
    offset += arr.length;
  }
  return out;
}

/**
 * Builds a minimal valid JP2 container buffer for demos and unit tests.
 *
 * @param {object} [options] - Customization options for the sample container.
 * @returns {Uint8Array} Binary JP2 container bytes.
 */
export function buildSampleJp2Buffer(options = {}) {
  const width = options.width ?? 640;
  const height = options.height ?? 480;
  const componentCount = options.componentCount ?? 3;
  const bpc = options.bpc ?? 0x07;
  const includeResolution = options.includeResolution ?? true;

  const sigPayload = new Uint8Array([0x0d, 0x0a, 0x87, 0x0a]);
  const sigBox = makeBox('jP  ', sigPayload);

  const ftypPayload = new Uint8Array(12);
  const ftypView = new DataView(ftypPayload.buffer);
  ftypPayload.set([0x6a, 0x70, 0x32, 0x20], 0);
  ftypView.setUint32(4, 0, false);
  ftypPayload.set([0x6a, 0x70, 0x32, 0x20], 8);
  const ftypBox = makeBox('ftyp', ftypPayload);

  const ihdrPayload = new Uint8Array(14);
  const ihdrView = new DataView(ihdrPayload.buffer);
  ihdrView.setUint32(0, height, false);
  ihdrView.setUint32(4, width, false);
  ihdrView.setUint16(8, componentCount, false);
  ihdrView.setUint8(10, bpc);
  ihdrView.setUint8(11, 7);
  ihdrView.setUint8(12, 0);
  ihdrView.setUint8(13, 0);
  const ihdrBox = makeBox('ihdr', ihdrPayload);

  const jp2hChildren = [ihdrBox];

  if (options.bpccValues) {
    jp2hChildren.push(makeBox('bpcc', new Uint8Array(options.bpccValues)));
  }

  if (options.iccProfileBytes) {
    const iccBytes = new Uint8Array(options.iccProfileBytes);
    const colrPayload = new Uint8Array(3 + iccBytes.length);
    colrPayload[0] = 2;
    colrPayload[1] = 0;
    colrPayload[2] = 0;
    colrPayload.set(iccBytes, 3);
    jp2hChildren.push(makeBox('colr', colrPayload));
  } else {
    const colrPayload = new Uint8Array(7);
    const colrView = new DataView(colrPayload.buffer);
    colrView.setUint8(0, 1);
    colrView.setUint8(1, 0);
    colrView.setUint8(2, 0);
    colrView.setUint32(3, options.enumCS ?? 16, false);
    jp2hChildren.push(makeBox('colr', colrPayload));
  }

  if (includeResolution) {
    const makeGridPayload = (dpi) => {
      const ppm = Math.round(dpi / 0.0254);
      const buf = new Uint8Array(10);
      const v = new DataView(buf.buffer);
      v.setUint16(0, ppm, false);
      v.setUint16(2, 1, false);
      v.setUint16(4, ppm, false);
      v.setUint16(6, 1, false);
      v.setInt8(8, 0);
      v.setInt8(9, 0);
      return buf;
    };
    const rescBox = makeBox('resc', makeGridPayload(300));
    const resdBox = makeBox('resd', makeGridPayload(72));
    jp2hChildren.push(makeBox('res ', concatBytes([rescBox, resdBox])));
  }

  const jp2hBox = makeBox('jp2h', concatBytes(jp2hChildren), {
    extended: Boolean(options.extendedJp2h),
  });

  const jp2cPayload = new Uint8Array([0xff, 0x4f, 0xff, 0x51, 0x00, 0x02, 0xff, 0xd9]);
  const jp2cBox = makeBox('jp2c', jp2cPayload, {
    toEof: Boolean(options.codestreamToEof),
  });

  return concatBytes([sigBox, ftypBox, jp2hBox, jp2cBox]);
}

/**
 * Builds a minimal raw JPEG 2000 codestream (.j2k / .j2c) starting with SOC marker 0xFF4F.
 *
 * @returns {Uint8Array} Raw J2K codestream bytes.
 */
export function buildSampleCodestreamBuffer() {
  return new Uint8Array([0xff, 0x4f, 0xff, 0x51, 0x00, 0x04, 0x00, 0x00, 0xff, 0xd9]);
}
