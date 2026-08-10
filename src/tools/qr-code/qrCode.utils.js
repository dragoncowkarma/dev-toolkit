/**
 * Pure-JS QR Code (ISO/IEC 18004) encoder.
 *
 * Implements byte-mode encoding, Reed-Solomon error correction, the eight
 * standard data masks with penalty-based selection, and automatic version
 * (1-40) sizing. No runtime dependency is used - everything here is derived
 * directly from the QR Code specification so the tool never needs anything
 * beyond `react`/`react-dom`.
 *
 * Byte mode alone is used (rather than also implementing numeric/alphanumeric
 * modes) because it losslessly covers arbitrary UTF-8 text and URLs, which is
 * the tool's full requirement.
 */

/** Ordered list of supported error correction levels, weakest to strongest. */
export const ERROR_CORRECTION_LEVELS = ['L', 'M', 'Q', 'H'];

/** Thrown when the input text exceeds the largest QR version's capacity. */
export class QrCapacityError extends Error {
  constructor(message) {
    super(message);
    this.name = 'QrCapacityError';
  }
}

// === Static QR spec tables (ISO/IEC 18004 Table 9) ===========================
// Index 0 is unused (versions are 1-40); rows are ordered L, M, Q, H.

const ECC_CODEWORDS_PER_BLOCK = [
  [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28,
    28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26,
    26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30,
    28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28,
    30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
];

const NUM_ERROR_CORRECTION_BLOCKS = [
  [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8,
    8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16,
    17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20,
    23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25,
    25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
];

// Number of bit-padding "remainder" modules after the interleaved codeword
// stream, indexed by version (ISO/IEC 18004 Table 1 / 7.4.10).
const REMAINDER_BITS = [
  0, 0, 7, 7, 7, 7, 7, 0, 0, 0, 0, 0, 0, 0, 3, 3, 3, 3, 3, 3, 3,
  4, 4, 4, 4, 4, 4, 4, 3, 3, 3, 3, 3, 3, 3, 0, 0, 0, 0, 0, 0,
];

const EC_LEVEL_BITS = { L: 1, M: 0, Q: 3, H: 2 };

// === GF(256) arithmetic for Reed-Solomon ======================================

const GF_EXP = new Uint8Array(512);
const GF_LOG = new Uint8Array(256);

(function initGaloisField() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) {
    GF_EXP[i] = GF_EXP[i - 255];
  }
})();

function gfMultiply(a, b) {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[GF_LOG[a] + GF_LOG[b]];
}

function multiplyPolynomials(a, b) {
  const result = new Array(a.length + b.length - 1).fill(0);
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      result[i + j] ^= gfMultiply(a[i], b[j]);
    }
  }
  return result;
}

function buildGeneratorPolynomial(degree) {
  let coefficients = [1];
  for (let i = 0; i < degree; i++) {
    coefficients = multiplyPolynomials(coefficients, [1, GF_EXP[i]]);
  }
  return coefficients;
}

/**
 * Computes the Reed-Solomon error correction codewords for one data block.
 *
 * @param {number[]} dataCodewords - Data codewords for a single block.
 * @param {number} degree - Number of error correction codewords to produce.
 * @returns {number[]} The error correction codewords.
 */
function computeReedSolomonRemainder(dataCodewords, degree) {
  const generator = buildGeneratorPolynomial(degree);
  const remainder = new Array(degree).fill(0);
  for (const dataByte of dataCodewords) {
    const factor = dataByte ^ remainder[0];
    remainder.shift();
    remainder.push(0);
    for (let i = 0; i < degree; i++) {
      remainder[i] ^= gfMultiply(generator[i + 1], factor);
    }
  }
  return remainder;
}

// === Capacity / version selection ============================================

function getNumRawDataModules(version) {
  let result = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const numAlign = Math.floor(version / 7) + 2;
    result -= (25 * numAlign - 10) * numAlign - 55;
    if (version >= 7) {
      result -= 36;
    }
  }
  return result;
}

function getNumDataCodewords(version, level) {
  const idx = ERROR_CORRECTION_LEVELS.indexOf(level);
  const numBlocks = NUM_ERROR_CORRECTION_BLOCKS[idx][version];
  const eccPerBlock = ECC_CODEWORDS_PER_BLOCK[idx][version];
  const rawCodewords = Math.floor(getNumRawDataModules(version) / 8);
  return rawCodewords - eccPerBlock * numBlocks;
}

function getByteModeHeaderBits(version) {
  const countBits = version < 10 ? 8 : 16;
  return 4 + countBits;
}

/**
 * Finds the smallest QR version (1-40) able to hold `byteLength` bytes of
 * byte-mode data at the given error correction level.
 *
 * @param {number} byteLength - Number of UTF-8 bytes to encode.
 * @param {string} level - Error correction level ('L' | 'M' | 'Q' | 'H').
 * @returns {number|null} The smallest fitting version, or `null` if too large.
 */
function findMinimumVersion(byteLength, level) {
  for (let version = 1; version <= 40; version++) {
    const availableBits = getNumDataCodewords(version, level) * 8 - getByteModeHeaderBits(version);
    if (availableBits >= 0 && byteLength * 8 <= availableBits) {
      return version;
    }
  }
  return null;
}

/**
 * Returns the maximum number of UTF-8 bytes byte-mode encoding can hold at
 * the given error correction level (i.e. the version-40 capacity).
 *
 * @param {string} level - Error correction level ('L' | 'M' | 'Q' | 'H').
 * @returns {number} Maximum byte length encodable at this level.
 */
export function getMaxByteCapacity(level) {
  const availableBits = getNumDataCodewords(40, level) * 8 - getByteModeHeaderBits(40);
  return Math.floor(availableBits / 8);
}

// === Bit-level data codeword construction =====================================

class BitBuffer {
  constructor() {
    this.bits = [];
  }

  get length() {
    return this.bits.length;
  }

  push(value, bitCount) {
    for (let i = bitCount - 1; i >= 0; i--) {
      this.bits.push((value >>> i) & 1);
    }
  }
}

function buildDataCodewords(bytes, version, level) {
  const buffer = new BitBuffer();
  buffer.push(0b0100, 4); // Byte mode indicator.
  buffer.push(bytes.length, version < 10 ? 8 : 16);
  for (const byte of bytes) {
    buffer.push(byte, 8);
  }

  const dataCapacityBits = getNumDataCodewords(version, level) * 8;
  const terminatorLength = Math.min(4, dataCapacityBits - buffer.length);
  if (terminatorLength > 0) {
    buffer.push(0, terminatorLength);
  }
  while (buffer.length % 8 !== 0) {
    buffer.push(0, 1);
  }
  const padBytes = [0xec, 0x11];
  let padIndex = 0;
  while (buffer.length < dataCapacityBits) {
    buffer.push(padBytes[padIndex % 2], 8);
    padIndex++;
  }

  const codewords = [];
  for (let i = 0; i < buffer.bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) {
      byte = (byte << 1) | buffer.bits[i + j];
    }
    codewords.push(byte);
  }
  return codewords;
}

function splitAndEncodeBlocks(dataCodewords, version, level) {
  const idx = ERROR_CORRECTION_LEVELS.indexOf(level);
  const numBlocks = NUM_ERROR_CORRECTION_BLOCKS[idx][version];
  const eccLength = ECC_CODEWORDS_PER_BLOCK[idx][version];
  const totalData = dataCodewords.length;
  const shortBlockLength = Math.floor(totalData / numBlocks);
  const numLongBlocks = totalData % numBlocks;
  const numShortBlocks = numBlocks - numLongBlocks;

  const blocks = [];
  let offset = 0;
  for (let i = 0; i < numBlocks; i++) {
    const length = shortBlockLength + (i < numShortBlocks ? 0 : 1);
    const data = dataCodewords.slice(offset, offset + length);
    offset += length;
    blocks.push({ data, ecc: computeReedSolomonRemainder(data, eccLength) });
  }
  return blocks;
}

function interleaveBlocks(blocks) {
  const maxDataLength = Math.max(...blocks.map((block) => block.data.length));
  const eccLength = blocks[0].ecc.length;
  const result = [];
  for (let i = 0; i < maxDataLength; i++) {
    for (const block of blocks) {
      if (i < block.data.length) result.push(block.data[i]);
    }
  }
  for (let i = 0; i < eccLength; i++) {
    for (const block of blocks) {
      result.push(block.ecc[i]);
    }
  }
  return result;
}

function codewordsToBits(codewords) {
  const bits = [];
  for (const byte of codewords) {
    for (let i = 7; i >= 0; i--) {
      bits.push((byte >>> i) & 1);
    }
  }
  return bits;
}

// === Matrix construction =======================================================

function createGrid(size, fillValue) {
  return Array.from({ length: size }, () => new Array(size).fill(fillValue));
}

function getAlignmentPatternPositions(version) {
  if (version === 1) return [];
  const numAlign = Math.floor(version / 7) + 2;
  const step = version === 32 ? 26 : Math.ceil((version * 4 + 4) / (numAlign * 2 - 2)) * 2;
  const positions = [6];
  for (let pos = version * 4 + 10; positions.length < numAlign; pos -= step) {
    positions.splice(1, 0, pos);
  }
  return positions;
}

function setFunctionModule(modules, isFunction, x, y, dark) {
  modules[y][x] = dark;
  isFunction[y][x] = true;
}

function drawTimingPatterns(modules, isFunction, size) {
  for (let i = 0; i < size; i++) {
    const dark = i % 2 === 0;
    if (!isFunction[6][i]) setFunctionModule(modules, isFunction, i, 6, dark);
    if (!isFunction[i][6]) setFunctionModule(modules, isFunction, 6, i, dark);
  }
}

function drawFinderPattern(modules, isFunction, size, cx, cy) {
  for (let dy = -4; dy <= 4; dy++) {
    for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx;
      const y = cy + dy;
      if (x >= 0 && x < size && y >= 0 && y < size) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        setFunctionModule(modules, isFunction, x, y, dist !== 2 && dist !== 4);
      }
    }
  }
}

function drawAlignmentPattern(modules, isFunction, cx, cy) {
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const dist = Math.max(Math.abs(dx), Math.abs(dy));
      setFunctionModule(modules, isFunction, cx + dx, cy + dy, dist !== 1);
    }
  }
}

function drawAlignmentPatterns(modules, isFunction, version) {
  const positions = getAlignmentPatternPositions(version);
  const numAlign = positions.length;
  for (let i = 0; i < numAlign; i++) {
    for (let j = 0; j < numAlign; j++) {
      // Skip the three corners, which already hold a finder pattern.
      const isCorner =
        (i === 0 && j === 0) || (i === 0 && j === numAlign - 1) || (i === numAlign - 1 && j === 0);
      if (isCorner) continue;
      drawAlignmentPattern(modules, isFunction, positions[i], positions[j]);
    }
  }
}

function computeFormatBits(level, maskPattern) {
  const data = (EC_LEVEL_BITS[level] << 3) | maskPattern;
  let rem = data;
  for (let i = 0; i < 10; i++) {
    rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  }
  return ((data << 10) | rem) ^ 0x5412;
}

function computeVersionBits(version) {
  let rem = version;
  for (let i = 0; i < 12; i++) {
    rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  }
  return (version << 12) | rem;
}

function writeFormatBits(modules, isFunction, size, formatBits) {
  const bit = (i) => ((formatBits >>> i) & 1) !== 0;
  for (let i = 0; i <= 5; i++) setFunctionModule(modules, isFunction, 8, i, bit(i));
  setFunctionModule(modules, isFunction, 8, 7, bit(6));
  setFunctionModule(modules, isFunction, 8, 8, bit(7));
  setFunctionModule(modules, isFunction, 7, 8, bit(8));
  for (let i = 9; i <= 14; i++) setFunctionModule(modules, isFunction, 14 - i, 8, bit(i));

  for (let i = 0; i <= 7; i++) setFunctionModule(modules, isFunction, size - 1 - i, 8, bit(i));
  for (let i = 8; i <= 14; i++) setFunctionModule(modules, isFunction, 8, size - 15 + i, bit(i));
  // The module below the bottom-left format strip is always dark.
  setFunctionModule(modules, isFunction, 8, size - 8, true);
}

function writeVersionBits(modules, isFunction, size, version) {
  if (version < 7) return;
  const versionBits = computeVersionBits(version);
  for (let i = 0; i < 18; i++) {
    const bit = ((versionBits >>> i) & 1) !== 0;
    const a = size - 11 + (i % 3);
    const b = Math.floor(i / 3);
    setFunctionModule(modules, isFunction, a, b, bit);
    setFunctionModule(modules, isFunction, b, a, bit);
  }
}

function placeDataBits(modules, isFunction, size, bits) {
  let bitIndex = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (!isFunction[y][x] && bitIndex < bits.length) {
          modules[y][x] = bits[bitIndex] === 1;
          bitIndex++;
        }
      }
    }
  }
}

const MASK_FUNCTIONS = [
  (x, y) => (x + y) % 2 === 0,
  (x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

function applyMask(modules, isFunction, size, maskPattern) {
  const maskFn = MASK_FUNCTIONS[maskPattern];
  const result = modules.map((row) => row.slice());
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!isFunction[y][x] && maskFn(x, y)) {
        result[y][x] = !result[y][x];
      }
    }
  }
  return result;
}

function runPenalty(line) {
  let penalty = 0;
  let runLength = 1;
  for (let i = 1; i < line.length; i++) {
    if (line[i] === line[i - 1]) {
      runLength++;
    } else {
      if (runLength >= 5) penalty += 3 + (runLength - 5);
      runLength = 1;
    }
  }
  if (runLength >= 5) penalty += 3 + (runLength - 5);
  return penalty;
}

function matchesPattern(line, offset, pattern) {
  for (let i = 0; i < pattern.length; i++) {
    if (line[offset + i] !== pattern[i]) return false;
  }
  return true;
}

// The 1:1:3:1:1 "finder-like" ratio pattern, padded by 4 light modules on
// either side, per ISO/IEC 18004 8.8.2 rule 3.
const FINDER_LIKE_PATTERN_A = [
  true, false, true, true, true, false, true, false, false, false, false,
];
const FINDER_LIKE_PATTERN_B = [
  false, false, false, false, true, false, true, true, true, false, true,
];

function finderLikePatternPenalty(line) {
  let penalty = 0;
  for (let i = 0; i <= line.length - 11; i++) {
    const matchesA = matchesPattern(line, i, FINDER_LIKE_PATTERN_A);
    const matchesB = matchesPattern(line, i, FINDER_LIKE_PATTERN_B);
    if (matchesA || matchesB) {
      penalty += 40;
    }
  }
  return penalty;
}

function computePenalty(modules, size) {
  let penalty = 0;

  for (let y = 0; y < size; y++) {
    penalty += runPenalty(modules[y]);
    penalty += finderLikePatternPenalty(modules[y]);
  }
  for (let x = 0; x < size; x++) {
    const column = modules.map((row) => row[x]);
    penalty += runPenalty(column);
    penalty += finderLikePatternPenalty(column);
  }

  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      const v = modules[y][x];
      if (v === modules[y][x + 1] && v === modules[y + 1][x] && v === modules[y + 1][x + 1]) {
        penalty += 3;
      }
    }
  }

  let dark = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (modules[y][x]) dark++;
    }
  }
  const percentDark = (dark * 100) / (size * size);
  penalty += Math.floor(Math.abs(percentDark - 50) / 5) * 10;

  return penalty;
}

function buildMatrix(bits, version, level) {
  const size = 17 + 4 * version;
  const modules = createGrid(size, false);
  const isFunction = createGrid(size, false);

  drawTimingPatterns(modules, isFunction, size);
  drawFinderPattern(modules, isFunction, size, 3, 3);
  drawFinderPattern(modules, isFunction, size, size - 4, 3);
  drawFinderPattern(modules, isFunction, size, 3, size - 4);
  drawAlignmentPatterns(modules, isFunction, version);
  writeFormatBits(modules, isFunction, size, 0); // Reserve the area; real bits follow.
  writeVersionBits(modules, isFunction, size, version);
  placeDataBits(modules, isFunction, size, bits);

  let best = null;
  for (let mask = 0; mask < 8; mask++) {
    const candidate = applyMask(modules, isFunction, size, mask);
    writeFormatBits(candidate, isFunction, size, computeFormatBits(level, mask));
    const penalty = computePenalty(candidate, size);
    if (!best || penalty < best.penalty) {
      best = { modules: candidate, mask, penalty };
    }
  }

  return { matrix: best.modules, size, maskPattern: best.mask };
}

function appendRemainderBits(bits, version) {
  for (let i = 0; i < REMAINDER_BITS[version]; i++) {
    bits.push(0);
  }
}

/**
 * Generates a QR Code matrix for the given text.
 *
 * @param {string} text - Text or URL to encode (arbitrary UTF-8).
 * @param {object} [options] - Generation options.
 * @param {string} [options.errorCorrectionLevel] - 'L' | 'M' | 'Q' | 'H' (default 'M').
 * @returns {{
 *   matrix: boolean[][],
 *   size: number,
 *   version: number,
 *   errorCorrectionLevel: string,
 *   maskPattern: number,
 * }} The generated QR code data. `matrix[y][x]` is `true` for a dark module.
 * @throws {QrCapacityError} If `text` exceeds the largest version's capacity.
 */
export function generateQrCode(text, options = {}) {
  const { errorCorrectionLevel = 'M' } = options;
  if (!ERROR_CORRECTION_LEVELS.includes(errorCorrectionLevel)) {
    throw new Error(`Unsupported error correction level: ${errorCorrectionLevel}`);
  }

  const bytes = Array.from(new TextEncoder().encode(text));
  const version = findMinimumVersion(bytes.length, errorCorrectionLevel);
  if (version === null) {
    const max = getMaxByteCapacity(errorCorrectionLevel);
    throw new QrCapacityError(
      `Input is too long for error correction level ${errorCorrectionLevel} ` +
        `(max ${max} bytes, got ${bytes.length} bytes).`,
    );
  }

  const dataCodewords = buildDataCodewords(bytes, version, errorCorrectionLevel);
  const blocks = splitAndEncodeBlocks(dataCodewords, version, errorCorrectionLevel);
  const interleaved = interleaveBlocks(blocks);
  const bits = codewordsToBits(interleaved);
  appendRemainderBits(bits, version);

  const { matrix, size, maskPattern } = buildMatrix(bits, version, errorCorrectionLevel);
  return { matrix, size, version, errorCorrectionLevel, maskPattern };
}

/**
 * Draws a QR matrix onto a canvas element, including a quiet-zone border.
 *
 * @param {HTMLCanvasElement} canvas - Target canvas (resized to fit).
 * @param {boolean[][]} matrix - QR matrix from {@link generateQrCode}.
 * @param {object} [options] - Rendering options.
 * @param {number} [options.moduleSize] - Pixel size of each module (default 8).
 * @param {number} [options.quietZone] - Quiet-zone width in modules (default 4).
 * @param {string} [options.darkColor] - Fill color for dark modules.
 * @param {string} [options.lightColor] - Fill color for light modules/background.
 * @returns {void}
 */
export function drawQrToCanvas(canvas, matrix, options = {}) {
  const { moduleSize = 8, quietZone = 4, darkColor = '#000000', lightColor = '#ffffff' } = options;
  const size = matrix.length;
  const pixelSize = (size + quietZone * 2) * moduleSize;

  canvas.width = pixelSize;
  canvas.height = pixelSize;

  const ctx = canvas.getContext('2d');
  ctx.fillStyle = lightColor;
  ctx.fillRect(0, 0, pixelSize, pixelSize);
  ctx.fillStyle = darkColor;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (matrix[y][x]) {
        const px = (x + quietZone) * moduleSize;
        const py = (y + quietZone) * moduleSize;
        ctx.fillRect(px, py, moduleSize, moduleSize);
      }
    }
  }
}
