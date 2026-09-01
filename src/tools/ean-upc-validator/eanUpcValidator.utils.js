const GS1_PREFIX_RANGES = [
  [0, 139, 'GS1 US'],
  [300, 379, 'GS1 France'],
  [380, 380, 'GS1 Bulgaria'],
  [383, 383, 'GS1 Slovenia'],
  [400, 440, 'GS1 Germany'],
  [450, 459, 'GS1 Japan'],
  [460, 469, 'GS1 Russia'],
  [471, 471, 'GS1 Taiwan'],
  [489, 489, 'GS1 Hong Kong'],
  [490, 499, 'GS1 Japan'],
  [500, 509, 'GS1 UK'],
  [690, 699, 'GS1 China'],
];

/**
 * Removes spaces and hyphens from a barcode value.
 *
 * @param {string} value - The value supplied by the user.
 * @returns {string} The compact barcode value.
 */
export function normalizeBarcode(value) {
  return typeof value === 'string' ? value.replace(/[\s-]/g, '') : '';
}

/**
 * Computes a GS1 modulo-10 check digit for a numeric barcode payload.
 *
 * @param {string} payload - Barcode digits excluding the check digit.
 * @returns {number|null} The calculated digit, or null for non-numeric input.
 */
export function computeCheckDigit(payload) {
  if (typeof payload !== 'string' || !/^\d+$/.test(payload)) return null;

  const total = [...payload].reverse().reduce(
    (sum, digit, indexFromRight) => sum + Number(digit) * (indexFromRight % 2 === 0 ? 3 : 1),
    0
  );
  return (10 - (total % 10)) % 10;
}

/**
 * Validates the final check digit in a complete numeric barcode.
 *
 * @param {string} identifier - Barcode digits including the final check digit.
 * @returns {{ actual: number, expected: number, isValid: boolean }|null} Validation details.
 */
export function validateCheckDigit(identifier) {
  if (typeof identifier !== 'string' || !/^\d{2,}$/.test(identifier)) return null;

  const expected = computeCheckDigit(identifier.slice(0, -1));
  const actual = Number(identifier.at(-1));
  return { actual, expected, isValid: actual === expected };
}

/**
 * Gives a readable GS1 member organisation description for an EAN prefix.
 *
 * @param {string} prefix - Three GS1 prefix digits.
 * @returns {string} A country or issuing-body description.
 */
export function describeGs1Prefix(prefix) {
  const prefixNumber = Number(prefix);
  const range = GS1_PREFIX_RANGES.find(
    ([start, end]) => prefixNumber >= start && prefixNumber <= end
  );
  return range ? range[2] : 'GS1 issuing body allocation';
}

function createBreakdown(format, digits) {
  const checkDigit = digits.at(-1);
  if (format === 'UPC-A') {
    return [
      { label: 'GS1 prefix / number system', value: digits[0], detail: 'UPC-A / GS1 US' },
      { label: 'Manufacturer code', value: digits.slice(1, 6) },
      { label: 'Item reference', value: digits.slice(6, 11) },
      { label: 'Check digit', value: checkDigit },
    ];
  }

  const prefix = digits.slice(0, 3);
  return [
    { label: 'GS1 prefix', value: prefix, detail: describeGs1Prefix(prefix) },
    {
      label: 'Manufacturer / item reference payload',
      value: digits.slice(3, -1),
      detail: 'Company-prefix allocation lengths vary by GS1 member organisation.',
    },
    { label: 'Check digit', value: checkDigit },
  ];
}

function fullResult(format, digits) {
  const validation = validateCheckDigit(digits);
  const canonicalGtin = format === 'UPC-A' ? `0${digits}` : digits;
  return {
    breakdown: createBreakdown(format, digits),
    canonicalGtin,
    checkDigit: validation.actual,
    expectedCheckDigit: validation.expected,
    format,
    fullValue: digits,
    isComplete: true,
    isValid: validation.isValid,
  };
}

function missingCheckDigitResult(format, payload) {
  const checkDigit = computeCheckDigit(payload);
  const fullValue = `${payload}${checkDigit}`;
  return {
    breakdown: createBreakdown(format, fullValue),
    canonicalGtin: fullValue,
    checkDigit,
    expectedCheckDigit: checkDigit,
    format,
    fullValue,
    isComplete: false,
    isValid: true,
  };
}

/**
 * Analyses an EAN-8, UPC-A, or EAN-13 barcode entirely client-side.
 *
 * A 12-digit value is UPC-A in automatic mode. Select `ean13` to treat the
 * same length as an EAN-13 payload that needs its final check digit.
 *
 * @param {string} value - Barcode value, optionally containing spaces or hyphens.
 * @param {'auto'|'ean8'|'upc'|'ean13'} [formatHint='auto'] - Intended format.
 * @returns {{ error: string }|{ breakdown: Array, canonicalGtin: string, checkDigit: number,
 * expectedCheckDigit: number, format: string, fullValue: string, isComplete: boolean,
 * isValid: boolean }|null} The barcode result, error, or null for an empty value.
 */
export function analyzeBarcode(value, formatHint = 'auto') {
  const digits = normalizeBarcode(value);
  if (!digits) return null;
  if (!/^\d+$/.test(digits)) {
    return { error: 'Use digits only; spaces and hyphens are allowed as separators.' };
  }

  const formats = {
    ean8: { completeLength: 8, format: 'EAN-8', payloadLength: 7 },
    upc: { completeLength: 12, format: 'UPC-A', payloadLength: null },
    ean13: { completeLength: 13, format: 'EAN-13', payloadLength: 12 },
  };

  if (formatHint !== 'auto') {
    const selected = formats[formatHint];
    if (digits.length === selected.completeLength) return fullResult(selected.format, digits);
    if (digits.length === selected.payloadLength) {
      return missingCheckDigitResult(selected.format, digits);
    }
    const requiredLength = selected.payloadLength ?? selected.completeLength;
    return { error: `Enter a ${requiredLength}-digit ${selected.format} value.` };
  }

  if (digits.length === 7) return missingCheckDigitResult('EAN-8', digits);
  if (digits.length === 8) return fullResult('EAN-8', digits);
  if (digits.length === 12) return fullResult('UPC-A', digits);
  if (digits.length === 13) return fullResult('EAN-13', digits);

  return {
    error: 'Enter 7 or 8 digits for EAN-8, 12 digits for UPC-A, or 13 digits for EAN-13.',
  };
}
