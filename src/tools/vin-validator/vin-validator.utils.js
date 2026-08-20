/**
 * Transliteration map for NHTSA / SAE J853 check digit calculation.
 * Letters A-Z (excluding I, O, Q) map to digits 1-9.
 */
const TRANSLITERATION_MAP = {
  '0': 0, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
  'A': 1, 'B': 2, 'C': 3, 'D': 4, 'E': 5, 'F': 6, 'G': 7, 'H': 8,
  'J': 1, 'K': 2, 'L': 3, 'M': 4, 'N': 5,
  'P': 7,
  'R': 9,
  'S': 2, 'T': 3, 'U': 4, 'V': 5, 'W': 6, 'X': 7, 'Y': 8, 'Z': 9,
};

/**
 * Position weights for positions 1 through 17 per NHTSA / SAE J853.
 */
const POSITION_WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];

/**
 * Map of position 10 model year codes to candidate calendar years (30-year cycle).
 */
const MODEL_YEAR_MAP = {
  'A': [1980, 2010],
  'B': [1981, 2011],
  'C': [1982, 2012],
  'D': [1983, 2013],
  'E': [1984, 2014],
  'F': [1985, 2015],
  'G': [1986, 2016],
  'H': [1987, 2017],
  'J': [1988, 2018],
  'K': [1989, 2019],
  'L': [1990, 2020],
  'M': [1991, 2021],
  'N': [1992, 2022],
  'P': [1993, 2023],
  'R': [1994, 2024],
  'S': [1995, 2025],
  'T': [1996, 2026],
  'V': [1997, 2027],
  'W': [1998, 2028],
  'X': [1999, 2029],
  'Y': [2000, 2030],
  '1': [2001, 2031],
  '2': [2002, 2032],
  '3': [2003, 2033],
  '4': [2004, 2034],
  '5': [2005, 2035],
  '6': [2006, 2036],
  '7': [2007, 2037],
  '8': [2008, 2038],
  '9': [2009, 2039],
};

/**
 * Normalizes input by removing spaces and hyphens and converting to uppercase.
 * @param {string} input - Raw VIN input string.
 * @returns {string} Normalized VIN string.
 */
export function normalizeVin(input) {
  if (typeof input !== 'string') return '';
  return input.replace(/[\s-]/g, '').toUpperCase();
}

/**
 * Transliterates a character to its numeric value for check digit calculation.
 * @param {string} char - Single character.
 * @returns {number|null} Transliterated numeric value, or null if invalid.
 */
export function transliterateChar(char) {
  if (typeof char !== 'string' || char.length !== 1) return null;
  const upper = char.toUpperCase();
  return TRANSLITERATION_MAP[upper] ?? null;
}

/**
 * Calculates the NHTSA/SAE J853 MOD-11 check digit for a 17-character VIN.
 * @param {string} vin - 17-character normalized VIN.
 * @returns {{ expected: string, actual: string, matches: boolean, sum: number, remainder: number }}
 *   Check digit result.
 */
export function calculateCheckDigit(vin) {
  if (typeof vin !== 'string' || vin.length !== 17) {
    return { expected: '', actual: '', matches: false, sum: 0, remainder: 0 };
  }

  let sum = 0;
  for (let i = 0; i < 17; i += 1) {
    const char = vin[i];
    const value = TRANSLITERATION_MAP[char];
    if (value === undefined) {
      return { expected: '', actual: vin[8] || '', matches: false, sum: 0, remainder: 0 };
    }
    sum += value * POSITION_WEIGHTS[i];
  }

  const remainder = sum % 11;
  const expected = remainder === 10 ? 'X' : String(remainder);
  const actual = vin[8];

  return {
    expected,
    actual,
    matches: expected === actual,
    sum,
    remainder,
  };
}

/**
 * Decodes WMI region and country/continent information from WMI prefix.
 * @param {string} wmi - 3-character WMI string.
 * @returns {{ wmi: string, region: string, country: string, isNorthAmerica: boolean,
 *   manufacturer?: string }} WMI details.
 */
export function decodeWmi(wmi) {
  if (typeof wmi !== 'string' || wmi.length < 1) {
    return { wmi: wmi || '', region: 'Unknown', country: 'Unknown', isNorthAmerica: false };
  }
  const firstChar = wmi[0].toUpperCase();

  let region = 'Unknown';
  let country = 'Unknown';
  let isNorthAmerica = false;

  if (['1', '4', '5'].includes(firstChar)) {
    region = 'North America';
    country = 'United States';
    isNorthAmerica = true;
  } else if (firstChar === '2') {
    region = 'North America';
    country = 'Canada';
    isNorthAmerica = true;
  } else if (firstChar === '3') {
    region = 'North America';
    country = 'Mexico';
    isNorthAmerica = true;
  } else if (firstChar === '6') {
    region = 'Oceania';
    country = 'Australia';
  } else if (firstChar === '7') {
    region = 'Oceania / South America';
    country = 'New Zealand / French Guiana';
  } else if (['8', '9'].includes(firstChar)) {
    region = 'South America';
    country = firstChar === '8' ? 'Argentina / Chile' : 'Brazil';
  } else if (['A', 'B', 'C'].includes(firstChar)) {
    region = 'Africa';
    country = 'South Africa';
  } else if (['D', 'E'].includes(firstChar)) {
    region = 'Africa';
    country = 'Egypt / Morocco';
  } else if (['F', 'G', 'H'].includes(firstChar)) {
    region = 'Africa';
    country = 'West / Central Africa';
  } else if (firstChar === 'J') {
    region = 'Asia';
    country = 'Japan';
  } else if (firstChar === 'K') {
    region = 'Asia';
    country = 'South Korea';
  } else if (firstChar === 'L') {
    region = 'Asia';
    country = 'China';
  } else if (firstChar === 'M') {
    region = 'Asia';
    country = 'India / Southeast Asia';
  } else if (firstChar === 'N') {
    region = 'Asia';
    country = 'Turkey / Iran';
  } else if (firstChar === 'P') {
    region = 'Asia';
    country = 'Philippines / Malaysia';
  } else if (firstChar === 'R') {
    region = 'Asia';
    country = 'Taiwan / UAE';
  } else if (firstChar === 'S') {
    region = 'Europe';
    country = 'United Kingdom';
  } else if (firstChar === 'T') {
    region = 'Europe';
    country = 'Switzerland / Czech Republic / Hungary';
  } else if (firstChar === 'U') {
    region = 'Europe';
    country = 'Romania / Slovakia';
  } else if (firstChar === 'V') {
    region = 'Europe';
    country = 'France / Spain';
  } else if (firstChar === 'W') {
    region = 'Europe';
    country = 'Germany';
  } else if (firstChar === 'X') {
    region = 'Europe';
    country = 'Russia / CIS';
  } else if (firstChar === 'Y') {
    region = 'Europe';
    country = 'Sweden / Finland';
  } else if (firstChar === 'Z') {
    region = 'Europe';
    country = 'Italy';
  }

  const manufacturers = {
    '1FA': 'Ford (USA)',
    '1FT': 'Ford (USA Truck)',
    '1FM': 'Ford (USA SUV)',
    '1HG': 'Honda (USA)',
    '1GC': 'Chevrolet (USA)',
    '1G1': 'Chevrolet (USA)',
    '1J4': 'Jeep (USA)',
    '2HG': 'Honda (Canada)',
    '3FA': 'Ford (Mexico)',
    '3VW': 'Volkswagen (Mexico)',
    'JHM': 'Honda (Japan)',
    'JT2': 'Toyota (Japan)',
    'JTE': 'Toyota (Japan)',
    'KL1': 'Chevrolet (South Korea)',
    'KMH': 'Hyundai (South Korea)',
    'KNM': 'Nissan (South Korea)',
    'SAL': 'Land Rover (UK)',
    'SCC': 'Lotus (UK)',
    'WBA': 'BMW (Germany)',
    'WBS': 'BMW M (Germany)',
    'WDD': 'Mercedes-Benz (Germany)',
    'WDB': 'Mercedes-Benz (Germany)',
    'WVW': 'Volkswagen (Germany)',
    'WP0': 'Porsche (Germany)',
    'ZFF': 'Ferrari (Italy)',
  };

  const upperWmi = wmi.toUpperCase();
  const manufacturer = manufacturers[upperWmi];

  return {
    wmi: upperWmi,
    region,
    country,
    isNorthAmerica,
    ...(manufacturer ? { manufacturer } : {}),
  };
}

/**
 * Decodes model year code (VIN position 10) into candidate years.
 * @param {string} code - Single character at VIN position 10.
 * @returns {number[]|null} Array of two candidate model years (30-year cycle) or null if invalid.
 */
export function decodeModelYear(code) {
  if (typeof code !== 'string' || code.length !== 1) {
    return null;
  }
  const upperCode = code.toUpperCase();
  return MODEL_YEAR_MAP[upperCode] ?? null;
}

/**
 * Validates and decodes a VIN per ISO 3779 / NHTSA check digit algorithm.
 * @param {string} input - Raw VIN input string.
 * @returns {object} Detailed validation and decoding result object.
 */
export function validateVin(input) {
  if (typeof input !== 'string' || input.trim() === '') {
    return {
      raw: input,
      normalized: '',
      isValid: false,
      isFormatValid: false,
      isCheckDigitValid: false,
      isNorthAmerican: false,
      error: null,
      checkDigitInfo: null,
      decoded: null,
    };
  }

  const normalized = normalizeVin(input);

  // Check for disallowed letters I, O, Q
  const disallowedMatch = normalized.match(/[IOQ]/);
  if (disallowedMatch) {
    const char = disallowedMatch[0];
    return {
      raw: input,
      normalized,
      isValid: false,
      isFormatValid: false,
      isCheckDigitValid: false,
      isNorthAmerican: false,
      error: `Disallowed letter '${char}' found. ISO 3779 prohibits letters I, O,` +
        ' and Q to prevent confusion with 1 and 0.',
      checkDigitInfo: null,
      decoded: null,
    };
  }

  // Check for invalid non-alphanumeric characters
  const invalidCharMatch = normalized.match(/[^A-Z0-9]/);
  if (invalidCharMatch) {
    return {
      raw: input,
      normalized,
      isValid: false,
      isFormatValid: false,
      isCheckDigitValid: false,
      isNorthAmerican: false,
      error: `Invalid character '${invalidCharMatch[0]}' found.` +
        ' VIN must contain only alphanumeric characters (A-Z, 0-9).',
      checkDigitInfo: null,
      decoded: null,
    };
  }

  // Check exact length of 17 characters
  if (normalized.length !== 17) {
    return {
      raw: input,
      normalized,
      isValid: false,
      isFormatValid: false,
      isCheckDigitValid: false,
      isNorthAmerican: false,
      error: `Invalid length (${normalized.length} characters).` +
        ' A valid VIN must be exactly 17 characters.',
      checkDigitInfo: null,
      decoded: null,
    };
  }

  const wmiStr = normalized.slice(0, 3);
  const wmiInfo = decodeWmi(wmiStr);
  const checkDigitResult = calculateCheckDigit(normalized);
  const modelYearCode = normalized[9];
  const candidateModelYears = decodeModelYear(modelYearCode);

  const isCheckDigitValid = checkDigitResult.matches;
  const isNorthAmerican = wmiInfo.isNorthAmerica;

  let note = '';
  if (isCheckDigitValid) {
    note = isNorthAmerican
      ? 'Valid NHTSA / SAE J853 check digit.'
      : `Position 9 matches NHTSA check digit algorithm (optional for ${wmiInfo.region} VINs).`;
  } else {
    note = isNorthAmerican
      ? `Check digit mismatch: position 9 is '${checkDigitResult.actual}',` +
        ` calculated '${checkDigitResult.expected}'.`
      : `Position 9 ('${checkDigitResult.actual}') does not match NHTSA check digit` +
        ` ('${checkDigitResult.expected}'). Note: Check digit validation is informative` +
        ` for non-North American region (${wmiInfo.region}).`;
  }

  const checkDigitInfo = {
    actual: checkDigitResult.actual,
    expected: checkDigitResult.expected,
    matches: isCheckDigitValid,
    isMandatory: isNorthAmerican,
    note,
  };

  const isValid = isNorthAmerican ? isCheckDigitValid : true;
  const error = (!isValid && isNorthAmerican)
    ? `Check digit mismatch: position 9 is '${checkDigitResult.actual}',` +
      ` expected '${checkDigitResult.expected}'.`
    : null;

  const decoded = {
    wmi: wmiStr,
    wmiInfo,
    vds: normalized.slice(3, 8),
    checkDigitChar: normalized[8],
    modelYearCode,
    candidateModelYears,
    plantCode: normalized[10],
    vis: normalized.slice(11),
  };

  return {
    raw: input,
    normalized,
    isValid,
    isFormatValid: true,
    isCheckDigitValid,
    isNorthAmerican,
    error,
    checkDigitInfo,
    decoded,
  };
}
