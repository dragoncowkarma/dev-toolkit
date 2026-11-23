/**
 * Maximum number of leading bytes read from a file to inspect the Radiance HDR header
 * and first scanline prefix.
 */
export const MAX_HEADER_READ_BYTES = 65536;

/**
 * Valid Radiance HDR magic identifiers.
 */
export const RADIANCE_MAGIC_SIGNATURES = Object.freeze(['#?RADIANCE', '#?RGBE']);

/**
 * Supported Radiance HDR pixel formats.
 */
export const SUPPORTED_RADIANCE_FORMATS = Object.freeze([
  '32-bit_rle_rgbe',
  '32-bit_rle_xyze',
]);

/**
 * Descriptions for the 8 possible Radiance orientation combinations.
 * For X-major orientations (+X/-X first), scanlines run along Y.
 */
export const ORIENTATION_DESCRIPTIONS = Object.freeze({
  '-Y +X': 'Standard (top-to-bottom, left-to-right)',
  '-Y -X': 'Flipped horizontally (top-to-bottom, right-to-left)',
  '+Y +X': 'Flipped vertically (bottom-to-top, left-to-right)',
  '+Y -X': 'Rotated 180° (bottom-to-top, right-to-left)',
  '+X -Y': 'X-major transposed (left-to-right, top-to-bottom)',
  '-X -Y': 'X-major rotated 90° CW (right-to-left, top-to-bottom)',
  '+X +Y': 'X-major rotated 90° CCW (left-to-right, bottom-to-top)',
  '-X +Y': 'X-major transposed & flipped (right-to-left, bottom-to-top)',
});

/**
 * Formats a byte count into a human-readable string (e.g. "12.3 KB").
 *
 * @param {number} bytes
 * @returns {string}
 */
export function formatFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
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
 * Reads only the leading header bytes of a File or Blob asynchronously.
 *
 * @param {File|Blob} file - The file or blob to slice and read.
 * @param {number} [maxBytes=MAX_HEADER_READ_BYTES] - Maximum leading bytes to read.
 * @returns {Promise<Uint8Array>} Resolves with the leading bytes of the file.
 */
export function readLeadingHeaderBytes(file, maxBytes = MAX_HEADER_READ_BYTES) {
  if (!file || typeof file.slice !== 'function') {
    return Promise.reject(new TypeError('A valid File or Blob is required.'));
  }
  const slice = file.slice(0, maxBytes);
  if (typeof slice.arrayBuffer === 'function') {
    return slice.arrayBuffer().then(
      (buffer) => new Uint8Array(buffer),
      () => {
        throw new Error('Failed to read the selected file.');
      },
    );
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = /** @type {ArrayBuffer} */ (reader.result);
      resolve(new Uint8Array(result));
    };
    reader.onerror = () => reject(new Error('Failed to read the selected file.'));
    reader.readAsArrayBuffer(slice);
  });
}

/**
 * Reads a line of ASCII text up to the next LF (0x0A) byte.
 * Strips an optional trailing CR (0x0D).
 *
 * @param {Uint8Array} bytes
 * @param {number} startOffset
 * @returns {{ line: string, nextOffset: number } | null} Null if no LF is found before EOF.
 */
function readAsciiLine(bytes, startOffset) {
  let lfIndex = -1;
  for (let i = startOffset; i < bytes.length; i += 1) {
    if (bytes[i] === 0x0a) {
      lfIndex = i;
      break;
    }
  }
  if (lfIndex === -1) {
    return null;
  }
  let endIndex = lfIndex;
  if (endIndex > startOffset && bytes[endIndex - 1] === 0x0d) {
    endIndex -= 1;
  }
  let line = '';
  for (let i = startOffset; i < endIndex; i += 1) {
    line += String.fromCharCode(bytes[i]);
  }
  return {
    line,
    nextOffset: lfIndex + 1,
  };
}

/**
 * Parses a Radiance HDR resolution line such as "-Y 512 +X 768" or "+X 1024 -Y 512".
 *
 * @param {string} resolutionLine
 * @returns {{
 *   orientation: string,
 *   orientationDescription: string,
 *   width: number,
 *   height: number,
 *   yAxisSign: '+' | '-',
 *   xAxisSign: '+' | '-',
 *   majorAxis: 'Y' | 'X',
 *   minorAxis: 'X' | 'Y',
 *   scanlineLength: number,
 *   scanlineCount: number
 * }}
 */
export function parseResolutionLine(resolutionLine) {
  if (typeof resolutionLine !== 'string' || resolutionLine.trim().length === 0) {
    throw new Error('Truncated Radiance HDR header: missing resolution line.');
  }
  const match = resolutionLine
    .trim()
    .match(/^([+-])([XY])\s+(\d+)\s+([+-])([XY])\s+(\d+)$/);

  if (!match) {
    const trimmed = resolutionLine.trim();
    throw new Error(
      `Invalid Radiance HDR resolution line: "${trimmed}". Expected format like "-Y 512 +X 768".`,
    );
  }

  const [, sign1, axis1, dim1Str, sign2, axis2, dim2Str] = match;
  if (axis1 === axis2) {
    const trimmed = resolutionLine.trim();
    throw new Error(
      `Invalid Radiance HDR resolution line: "${trimmed}". Axes must include both X and Y.`,
    );
  }

  const dim1 = Number.parseInt(dim1Str, 10);
  const dim2 = Number.parseInt(dim2Str, 10);
  if (dim1 <= 0 || dim2 <= 0) {
    throw new Error(
      'Invalid Radiance HDR resolution dimensions: width and height must be positive integers.',
    );
  }

  const isYMajor = axis1 === 'Y';
  const height = isYMajor ? dim1 : dim2;
  const width = isYMajor ? dim2 : dim1;
  const yAxisSign = /** @type {'+' | '-'} */ (isYMajor ? sign1 : sign2);
  const xAxisSign = /** @type {'+' | '-'} */ (isYMajor ? sign2 : sign1);
  const orientation = `${sign1}${axis1} ${sign2}${axis2}`;
  const scanlineCount = dim1;
  const scanlineLength = dim2;

  return {
    orientation,
    orientationDescription:
      ORIENTATION_DESCRIPTIONS[orientation] || 'Custom orientation',
    width,
    height,
    yAxisSign,
    xAxisSign,
    majorAxis: /** @type {'Y' | 'X'} */ (axis1),
    minorAxis: /** @type {'X' | 'Y'} */ (axis2),
    scanlineLength,
    scanlineCount,
  };
}

/**
 * Checks whether a value is a Uint8Array (including across realm boundaries).
 *
 * @param {unknown} value
 * @returns {boolean}
 */
function isUint8Array(value) {
  return (
    value instanceof Uint8Array ||
    (ArrayBuffer.isView(value) && value.constructor?.name === 'Uint8Array')
  );
}

/**
 * Detects whether Radiance scanlines use new RLE, old RLE, or flat encoding
 * based on the leading scanline bytes and scanline length.
 *
 * Note: Old RLE detection is a heuristic that scans 4-byte records starting at
 * the second record (offset 4, up to 64 bytes) for the consecutive repeat marker
 * R=1, G=1, B=1, E>0. The first pixel (offset 0) cannot be a repeat marker
 * because there is no preceding pixel to repeat, though a flat file with a
 * very dark pixel (1,1,1,E) after the first pixel can still match the heuristic.
 *
 * @param {Uint8Array} scanlineBytes - Leading pixel bytes right after the resolution line.
 * @param {number} scanlineLength - Length of each scanline (minor axis dimension).
 * @returns {'new RLE' | 'old RLE' | 'flat'}
 */
export function detectScanlineEncoding(scanlineBytes, scanlineLength) {
  if (!isUint8Array(scanlineBytes) || scanlineBytes.length < 4) {
    return 'flat';
  }

  const b0 = scanlineBytes[0];
  const b1 = scanlineBytes[1];
  const b2 = scanlineBytes[2];
  const b3 = scanlineBytes[3];

  // New RLE (adaptive run-length encoding):
  // Starts with [2, 2, hi, lo] where ((hi << 8) | lo) matches scanlineLength
  // and scanlineLength is between 8 and 32767.
  if (b0 === 2 && b1 === 2 && (b2 & 0x80) === 0) {
    const encodedLength = (b2 << 8) | b3;
    if (
      encodedLength === scanlineLength &&
      scanlineLength >= 8 &&
      scanlineLength <= 0x7fff
    ) {
      return 'new RLE';
    }
  }

  // Old RLE: uses consecutive pixel repeat markers where R=1, G=1, B=1 and E=repeat count.
  // The first pixel (offset 0) cannot be a repeat marker since it needs a preceding pixel.
  const maxCheckOffset = Math.min(scanlineBytes.length - (scanlineBytes.length % 4), 64);
  for (let offset = 4; offset < maxCheckOffset; offset += 4) {
    if (
      scanlineBytes[offset] === 1 &&
      scanlineBytes[offset + 1] === 1 &&
      scanlineBytes[offset + 2] === 1 &&
      scanlineBytes[offset + 3] > 0
    ) {
      return 'old RLE';
    }
  }

  return 'flat';
}

/**
 * Parses a numeric tuple from a raw variable value string.
 *
 * @param {string} rawValue
 * @param {number} expectedCount
 * @returns {number[] | null}
 */
function parseNumericTuple(rawValue, expectedCount) {
  const parts = rawValue.trim().split(/\s+/);
  if (parts.length !== expectedCount) return null;
  const nums = parts.map((p) => Number(p));
  return nums.every((n) => Number.isFinite(n)) ? nums : null;
}

/**
 * Parses a Radiance HDR (.hdr / .pic) header from a Uint8Array or ASCII string.
 *
 * @param {Uint8Array | string} input - Leading file bytes or raw header text.
 * @returns {{
 *   magic: string,
 *   format: '32-bit_rle_rgbe' | '32-bit_rle_xyze',
 *   colorSpace: 'RGBE' | 'XYZE',
 *   exposure: number,
 *   pixelAspect: number,
 *   colorCorr: number[] | null,
 *   primaries: number[] | null,
 *   software: string | null,
 *   view: string | null,
 *   variables: Array<{ key: string, value: string }>,
 *   comments: string[],
 *   resolutionLine: string,
 *   orientation: string,
 *   orientationDescription: string,
 *   width: number,
 *   height: number,
 *   majorAxis: 'Y' | 'X',
 *   minorAxis: 'X' | 'Y',
 *   scanlineLength: number,
 *   scanlineCount: number,
 *   scanlineEncoding: 'new RLE' | 'old RLE' | 'flat',
 *   headerByteLength: number
 * }}
 */
export function parseRadianceHdrHeader(input) {
  let bytes;
  if (typeof input === 'string') {
    bytes = new TextEncoder().encode(input);
  } else if (isUint8Array(input)) {
    bytes = new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  } else if (input instanceof ArrayBuffer) {
    bytes = new Uint8Array(input);
  } else {
    throw new TypeError('Input must be a Uint8Array or string.');
  }

  if (bytes.length === 0) {
    throw new Error('Missing Radiance HDR magic line: file is empty.');
  }

  // 1. Validate magic line (#?RADIANCE or #?RGBE)
  const firstLineResult = readAsciiLine(bytes, 0);
  if (!firstLineResult) {
    const partial = new TextDecoder('ascii').decode(bytes.subarray(0, 32)).trim();
    if (!partial.startsWith('#?')) {
      throw new Error(
        'Missing Radiance HDR magic line: expected "#?RADIANCE" or "#?RGBE" at start of file.',
      );
    }
    throw new Error('Truncated Radiance HDR header: magic line is incomplete.');
  }

  const magic = firstLineResult.line.trim();
  if (!RADIANCE_MAGIC_SIGNATURES.includes(magic)) {
    const foundMagic = magic || '(empty)';
    throw new Error(
      `Missing Radiance HDR magic line: expected "#?RADIANCE" or "#?RGBE", found "${foundMagic}".`,
    );
  }

  // 2. Parse header variable lines and comments up to the blank line
  let offset = firstLineResult.nextOffset;
  let foundBlankLine = false;
  const variables = [];
  const comments = [];
  let format = null;
  let exposure = 1.0;
  let pixelAspect = 1.0;
  let colorCorr = null;
  let primaries = null;
  let software = null;
  let view = null;

  while (offset < bytes.length) {
    const lineResult = readAsciiLine(bytes, offset);
    if (!lineResult) {
      throw new Error(
        'Truncated Radiance HDR header: reached end of data before the blank line delimiter.',
      );
    }
    offset = lineResult.nextOffset;
    const rawLine = lineResult.line;

    if (rawLine.trim() === '') {
      foundBlankLine = true;
      break;
    }

    if (rawLine.startsWith('#')) {
      comments.push(rawLine.slice(1).trim());
      continue;
    }

    const eqIndex = rawLine.indexOf('=');
    if (eqIndex !== -1) {
      const key = rawLine.slice(0, eqIndex).trim().toUpperCase();
      const value = rawLine.slice(eqIndex + 1).trim();
      variables.push({ key, value });

      if (key === 'FORMAT') {
        format = value;
      } else if (key === 'EXPOSURE') {
        const parsedExp = Number(value);
        if (Number.isFinite(parsedExp) && parsedExp > 0) {
          // Radiance exposures are cumulative when specified multiple times
          exposure *= parsedExp;
        }
      } else if (key === 'PIXASPECT') {
        const parsedAspect = Number(value);
        if (Number.isFinite(parsedAspect) && parsedAspect > 0) {
          pixelAspect *= parsedAspect;
        }
      } else if (key === 'COLORCORR') {
        const tuple = parseNumericTuple(value, 3);
        if (tuple) {
          colorCorr = colorCorr
            ? colorCorr.map((v, idx) => v * tuple[idx])
            : tuple;
        }
      } else if (key === 'PRIMARIES') {
        const tuple = parseNumericTuple(value, 8);
        if (tuple) {
          primaries = tuple;
        }
      } else if (key === 'SOFTWARE') {
        software = value;
      } else if (key === 'VIEW') {
        view = value;
      }
    } else {
      // Non-comment command/history line in Radiance header
      comments.push(rawLine.trim());
    }
  }

  if (!foundBlankLine) {
    throw new Error(
      'Truncated Radiance HDR header: missing blank line delimiter before resolution line.',
    );
  }

  // 3. Validate FORMAT variable
  if (!format) {
    throw new Error(
      'Unsupported or missing Radiance HDR FORMAT: expected 32-bit_rle_rgbe or 32-bit_rle_xyze.',
    );
  }
  if (!SUPPORTED_RADIANCE_FORMATS.includes(format)) {
    const supportedList = '"32-bit_rle_rgbe" and "32-bit_rle_xyze"';
    throw new Error(
      `Unsupported Radiance HDR format "${format}": only ${supportedList} are supported.`,
    );
  }

  // 4. Read and parse the resolution line right after the blank line
  const resolutionLineResult = readAsciiLine(bytes, offset);
  if (!resolutionLineResult) {
    throw new Error(
      'Truncated Radiance HDR header: missing or incomplete resolution line after blank line.',
    );
  }

  const headerByteLength = resolutionLineResult.nextOffset;
  const resolution = parseResolutionLine(resolutionLineResult.line);

  // 5. Detect scanline encoding from the leading scanline bytes
  const scanlineBytes = bytes.subarray(headerByteLength);
  const scanlineEncoding = detectScanlineEncoding(
    scanlineBytes,
    resolution.scanlineLength,
  );

  return {
    magic,
    format: /** @type {'32-bit_rle_rgbe' | '32-bit_rle_xyze'} */ (format),
    colorSpace: format === '32-bit_rle_xyze' ? 'XYZE' : 'RGBE',
    exposure,
    pixelAspect,
    colorCorr,
    primaries,
    software,
    view,
    variables,
    comments,
    resolutionLine: resolutionLineResult.line.trim(),
    orientation: resolution.orientation,
    orientationDescription: resolution.orientationDescription,
    width: resolution.width,
    height: resolution.height,
    majorAxis: resolution.majorAxis,
    minorAxis: resolution.minorAxis,
    scanlineLength: resolution.scanlineLength,
    scanlineCount: resolution.scanlineCount,
    scanlineEncoding,
    headerByteLength,
  };
}

/**
 * Builds a sample synthetic Radiance HDR byte array for demonstration and testing.
 *
 * @param {'rgbe' | 'xyze'} [preset='rgbe']
 * @returns {Uint8Array}
 */
export function buildSampleRadianceHdrBytes(preset = 'rgbe') {
  const isXyze = preset === 'xyze';
  const headerLines = [
    isXyze ? '#?RGBE' : '#?RADIANCE',
    '# Sample Radiance HDR image header generated client-side',
    'SOFTWARE=Radiance rpict 5.4a',
    `FORMAT=${isXyze ? '32-bit_rle_xyze' : '32-bit_rle_rgbe'}`,
    'EXPOSURE=1.0000000000000',
    'COLORCORR=1.000 1.000 1.000',
    'PRIMARIES=0.6400 0.3300 0.2900 0.6000 0.1500 0.0600 0.3333 0.3333',
    'PIXASPECT=1.000000',
    '',
    '-Y 512 +X 768',
  ];
  const headerBytes = new TextEncoder().encode(`${headerLines.join('\n')}\n`);
  // New RLE prefix for scanline width 768 (0x0300): [0x02, 0x02, 0x03, 0x00]
  const scanlinePrefix = new Uint8Array([0x02, 0x02, 0x03, 0x00, 0x84, 0x80, 0x80, 0x80]);
  const combined = new Uint8Array(headerBytes.length + scanlinePrefix.length);
  combined.set(headerBytes, 0);
  combined.set(scanlinePrefix, headerBytes.length);
  return combined;
}
