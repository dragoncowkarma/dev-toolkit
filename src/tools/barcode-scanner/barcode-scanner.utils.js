const EAN_LEFT = {
  '0001101': '0', '0011001': '1', '0010011': '2', '0111101': '3', '0100011': '4',
  '0110001': '5', '0101111': '6', '0111011': '7', '0110111': '8', '0001011': '9',
};
const EAN_RIGHT = {
  '1110010': '0', '1100110': '1', '1101100': '2', '1000010': '3', '1011100': '4',
  '1001110': '5', '1010000': '6', '1000100': '7', '1001000': '8', '1110100': '9',
};
const EAN_G = {
  '0100111': '0', '0110011': '1', '0011011': '2', '0100001': '3', '0011101': '4',
  '0111001': '5', '0000101': '6', '0010001': '7', '0001001': '8', '0010111': '9',
};
const EAN_PARITY = {
  LLLLLL: '0', LLGLGG: '1', LLGGLG: '2', LLGGGL: '3', LGLLGG: '4', LGGLLG: '5',
  LGGGLL: '6', LGLGLG: '7', LGLGGL: '8', LGGLGL: '9',
};

// ISO/IEC 15417 patterns: code value zero through stop (106).
const CODE128_PATTERNS = [
  '212222','222122','222221','121223','121322','131222','122213','122312','132212','221213',
  '221312','231212','112232','122132','122231','113222','123122','123221','223211','221132',
  '221231','213212','223112','312131','311222','321122','321221','312212','322112','322211',
  '212123','212321','232121','111323','131123','131321','112313','132113','132311','211313',
  '231113','231311','112133','112331','132131','113123','113321','133121','313121','211331',
  '231131','213113','213311','213131','311123','311321','331121','312113','312311','332111',
  '314111','221411','431111','111224','111422','121124','121421','141122','141221','112214',
  '112412','122114','122411','142112','142211','241211','221114','413111','241112','134111',
  '111242','121142','121241','114212','124112','124211','411212','421112','421211','212141',
  '214121','412121','111143','111341','131141','114113','114311','411113','411311','113141',
  '114131','311141','411131','211412','211214','211232','2331112',
];

const CODE128_BY_PATTERN = Object.fromEntries(
  CODE128_PATTERNS.map((pattern, value) => [pattern, value]),
);

/**
 * Validates an EAN-13 or UPC-A check digit.
 * @param {string} value
 * @returns {boolean}
 */
export function hasValidEanUpcChecksum(value) {
  if (!/^\d{12,13}$/.test(value)) return false;
  const body = value.slice(0, -1);
  const expected = body
    .split('')
    .reverse()
    .reduce((total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 3 : 1), 0);
  return (10 - (expected % 10)) % 10 === Number(value.at(-1));
}

function decodeEanModules(modules) {
  if (
    modules.length !== 95 ||
    !modules.startsWith('101') ||
    !modules.endsWith('101') ||
    modules.slice(45, 50) !== '01010'
  ) return null;
  let parity = '';
  let left = '';
  let right = '';
  for (let index = 0; index < 6; index += 1) {
    const bits = modules.slice(3 + index * 7, 10 + index * 7);
    if (EAN_LEFT[bits] !== undefined) {
      left += EAN_LEFT[bits];
      parity += 'L';
    } else if (EAN_G[bits] !== undefined) {
      left += EAN_G[bits];
      parity += 'G';
    } else return null;
    const rightBits = modules.slice(50 + index * 7, 57 + index * 7);
    if (EAN_RIGHT[rightBits] === undefined) return null;
    right += EAN_RIGHT[rightBits];
  }
  const first = EAN_PARITY[parity];
  if (first === undefined) return null;
  const ean = `${first}${left}${right}`;
  if (!hasValidEanUpcChecksum(ean)) return null;
  return {
    value: first === '0' ? ean.slice(1) : ean,
    symbology: first === '0' ? 'UPC-A' : 'EAN-13',
    checksumValid: true,
  };
}

function decodeCode128Runs(runs) {
  const patterns = [];
  let position = 0;
  while (position < runs.length) {
    const remaining = runs.length - position;
    const width = remaining === 7 ? 7 : 6;
    if (remaining < 6) return null;
    patterns.push(runs.slice(position, position + width).join(''));
    position += width;
    if (width === 7) break;
  }
  if (patterns.at(-1) !== CODE128_PATTERNS[106]) return null;
  const codes = patterns.slice(0, -1).map((pattern) => CODE128_BY_PATTERN[pattern]);
  if (
    codes.some((code) => code === undefined) ||
    ![103, 104, 105].includes(codes[0]) ||
    codes.length < 3
  ) return null;
  const checksum = codes.at(-1);
  const data = codes.slice(1, -1);
  const calculated = (
    codes[0] + data.reduce((sum, code, index) => sum + code * (index + 1), 0)
  ) % 103;
  if (checksum !== calculated) return null;
  let set = codes[0] === 103 ? 'A' : codes[0] === 104 ? 'B' : 'C';
  let value = '';
  for (const code of data) {
    if (code === 99) { set = 'C'; continue; }
    if (code === 100) { set = 'B'; continue; }
    if (code === 101) { set = 'A'; continue; }
    if ((set === 'C' && code > 99) || (set !== 'C' && code > 95)) return null;
    if (set === 'C') value += String(code).padStart(2, '0');
    else value += String.fromCharCode(code + (set === 'B' ? 32 : code < 64 ? 32 : -64));
  }
  return { value, symbology: 'Code 128', checksumValid: true };
}

/**
 * Decodes a normalized black/white module string. Exported for deterministic testing.
 * @param {string} modules
 * @returns {{value: string, symbology: string, checksumValid: boolean}|null}
 */
export function decodeBarcodeModules(modules) {
  if (typeof modules !== 'string' || !/^[01]+$/.test(modules)) return null;
  const runs = modules.match(/1+|0+/g)?.map((run) => String(run.length)) ?? [];
  return decodeEanModules(modules) ?? decodeCode128Runs(runs);
}

function rowRuns(data, width, y) {
  const brightness = [];
  for (let x = 0; x < width; x += 1) {
    const offset = (y * width + x) * 4;
    brightness.push(data[offset] * 0.2126 + data[offset + 1] * 0.7152 + data[offset + 2] * 0.0722);
  }
  const low = Math.min(...brightness);
  const high = Math.max(...brightness);
  if (high - low < 40) return null;
  const threshold = (low + high) / 2;
  const bits = brightness.map((value) => (value < threshold ? '1' : '0')).join('');
  const trimmed = bits.replace(/^0+|0+$/g, '');
  if (!trimmed.startsWith('1')) return null;
  return trimmed.match(/1+|0+/g)?.map((run) => run.length) ?? null;
}

function decodeHorizontalScanLines(imageData) {
  const rows = new Set([Math.floor(imageData.height / 2)]);
  for (let ratio = 0.2; ratio <= 0.8; ratio += 0.1) rows.add(Math.floor(imageData.height * ratio));
  for (const y of rows) {
    const runs = rowRuns(imageData.data, imageData.width, y);
    if (!runs?.length) continue;
    const narrow = Math.min(...runs);
    for (let scale = 1; scale <= 4; scale += 1) {
      const unit = narrow / scale;
      const normalized = runs.map((run) => Math.round(run / unit));
      if (normalized.some((run) => run < 1 || run > 4)) continue;
      const modules = normalized
        .map((run, index) => (index % 2 === 0 ? '1' : '0').repeat(run))
        .join('');
      const decoded = decodeBarcodeModules(modules);
      if (decoded) return decoded;
    }
  }
  return null;
}

function transposeImageData({ data, width, height }) {
  const rotatedData = new Uint8ClampedArray(data.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sourceOffset = (y * width + x) * 4;
      const targetOffset = (x * height + y) * 4;
      rotatedData.set(data.subarray(sourceOffset, sourceOffset + 4), targetOffset);
    }
  }
  return { data: rotatedData, width: height, height: width };
}

/**
 * Decodes an ImageData-like raster by sampling horizontal scan lines.
 * @param {{data: Uint8ClampedArray, width: number, height: number}} imageData
 * @returns {{value: string, symbology: string, checksumValid: boolean}|null}
 */
export function decodeBarcodeFromImageData(imageData) {
  if (
    !imageData?.data ||
    !Number.isInteger(imageData.width) ||
    !Number.isInteger(imageData.height) ||
    imageData.width < 20 ||
    imageData.height < 1
  ) return null;
  const horizontalResult = decodeHorizontalScanLines(imageData);
  return horizontalResult ?? decodeHorizontalScanLines(transposeImageData(imageData));
}
