const CODE128_PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312',
  '132212', '221213', '221312', '231212', '112232', '122132', '122231', '113222',
  '123122', '123221', '223211', '221132', '221231', '213212', '223112', '312131',
  '311222', '321122', '321221', '312212', '322112', '322211', '212123', '212321',
  '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121',
  '313121', '211331', '231131', '213113', '213311', '213131', '311123', '311321',
  '331121', '312113', '312311', '332111', '314111', '221411', '431111', '111224',
  '111422', '121124', '121421', '141122', '141221', '112214', '112412', '122114',
  '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112',
  '421211', '212141', '214121', '412121', '111143', '111341', '131141', '114113',
  '114311', '411113', '411311', '113141', '114131', '311141', '411131', '211412',
  '211214', '211232', '2331112',
];

const EAN_LEFT_ODD = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001',
  '0101111', '0111011', '0110111', '0001011'];
const EAN_LEFT_EVEN = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001',
  '0000101', '0010001', '0001001', '0010111'];
const EAN_RIGHT = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110',
  '1010000', '1000100', '1001000', '1110100'];
const EAN_PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG',
  'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];

function widthsToModules(widths) {
  let isBar = true;
  let modules = '';
  for (const width of widths) {
    modules += (isBar ? '1' : '0').repeat(Number(width));
    isBar = !isBar;
  }
  return modules;
}

function assertDigits(value, lengths, label) {
  if (!/^\d+$/.test(value) || !lengths.includes(value.length)) {
    const lengthText = lengths.join(' or ');
    throw new Error(`${label} must contain exactly ${lengthText} digits.`);
  }
}

/**
 * Calculates the GS1 modulo-10 check digit for a barcode payload.
 * @param {string} digits Barcode payload digits, excluding its check digit.
 * @returns {string} The calculated check digit.
 */
export function calculateCheckDigit(digits) {
  if (!/^\d+$/.test(digits)) {
    throw new Error('A check digit can only be calculated from digits.');
  }
  const sum = [...digits].reduce((total, digit, index) => {
    return total + Number(digit) * ((digits.length - index) % 2 === 1 ? 3 : 1);
  }, 0);
  return String((10 - (sum % 10)) % 10);
}

/**
 * Normalizes and validates an EAN-13 input, adding a missing check digit.
 * @param {string} input Twelve payload digits or a complete EAN-13 value.
 * @returns {string} A valid 13-digit EAN-13 value.
 */
export function normalizeEan13(input) {
  const value = String(input).trim();
  assertDigits(value, [12, 13], 'EAN-13');
  const payload = value.slice(0, 12);
  const checkDigit = calculateCheckDigit(payload);
  if (value.length === 13 && value[12] !== checkDigit) {
    throw new Error(`EAN-13 check digit should be ${checkDigit}.`);
  }
  return `${payload}${checkDigit}`;
}

/**
 * Normalizes and validates a UPC-A input, adding a missing check digit.
 * @param {string} input Eleven payload digits or a complete UPC-A value.
 * @returns {string} A valid 12-digit UPC-A value.
 */
export function normalizeUpcA(input) {
  const value = String(input).trim();
  assertDigits(value, [11, 12], 'UPC-A');
  const payload = value.slice(0, 11);
  const checkDigit = calculateCheckDigit(payload);
  if (value.length === 12 && value[11] !== checkDigit) {
    throw new Error(`UPC-A check digit should be ${checkDigit}.`);
  }
  return `${payload}${checkDigit}`;
}

/**
 * Encodes printable and control ASCII text as Code 128 modules.
 * @param {string} input ASCII text to encode.
 * @returns {{modules: string, text: string}} Barcode modules and display text.
 */
export function encodeCode128(input) {
  if (typeof input !== 'string' || input.length === 0) {
    throw new Error('Code 128 requires text to encode.');
  }

  const values = [104];
  let activeSet = 'B';
  for (const character of input) {
    const code = character.charCodeAt(0);
    if (code > 127) {
      throw new Error('Code 128 supports ASCII characters only.');
    }
    const needsSetA = code < 32;
    if (needsSetA && activeSet !== 'A') {
      values.push(101);
      activeSet = 'A';
    } else if (!needsSetA && activeSet !== 'B' && code > 95) {
      values.push(100);
      activeSet = 'B';
    }
    values.push(needsSetA ? code + 64 : code - 32);
  }

  const checksum = values.reduce((total, value, index) => total + value * index, values[0]) % 103;
  values.push(checksum, 106);
  const modules = values.map((value) => widthsToModules(CODE128_PATTERNS[value])).join('');
  return { modules, text: input };
}

function encodeEanModules(value) {
  const parity = EAN_PARITY[Number(value[0])];
  const left = [...value.slice(1, 7)].map((digit, index) => {
    return (parity[index] === 'L' ? EAN_LEFT_ODD : EAN_LEFT_EVEN)[Number(digit)];
  }).join('');
  const right = [...value.slice(7)].map((digit) => EAN_RIGHT[Number(digit)]).join('');
  return `101${left}01010${right}101`;
}

/**
 * Encodes an EAN-13 input as bars, calculating its check digit when omitted.
 * @param {string} input Twelve or thirteen EAN-13 digits.
 * @returns {{modules: string, text: string}} Barcode modules and normalized text.
 */
export function encodeEan13(input) {
  const text = normalizeEan13(input);
  return { modules: encodeEanModules(text), text };
}

/**
 * Encodes a UPC-A input as bars, calculating its check digit when omitted.
 * @param {string} input Eleven or twelve UPC-A digits.
 * @returns {{modules: string, text: string}} Barcode modules and normalized text.
 */
export function encodeUpcA(input) {
  const text = normalizeUpcA(input);
  return { modules: encodeEanModules(`0${text}`), text };
}
