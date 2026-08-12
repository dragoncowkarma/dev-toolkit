/**
 * Punycode (RFC 3492) and IDNA (RFC 5890/5891) converter utilities.
 */

const BASE = 36;
const TMIN = 1;
const TMAX = 26;
const SKEW = 38;
const DAMP = 700;
const INITIAL_BIAS = 72;
const INITIAL_N = 128;
const DELIMITER = '-';

/**
 * Checks if a string contains any non-ASCII characters (code point >= 128).
 *
 * @param {string} str Input string.
 * @returns {boolean} True if string contains non-ASCII characters.
 */
function hasNonAscii(str) {
  return Array.from(str).some((char) => char.codePointAt(0) >= INITIAL_N);
}

/**
 * Converts a base-36 digit (0..35) to its ASCII char code point ('a'..'z' or '0'..'9').
 *
 * @param {number} digit Base-36 digit.
 * @returns {string} Corresponding character.
 */
function digitToChar(digit) {
  if (digit < 26) {
    return String.fromCharCode(digit + 97); // 'a' - 'z'
  }
  return String.fromCharCode(digit - 26 + 48); // '0' - '9'
}

/**
 * Converts an ASCII character code point to its base-36 digit value (0..35).
 *
 * @param {number} codePoint Character code point.
 * @returns {number} Digit 0..35, or -1 if invalid.
 */
function charToDigit(codePoint) {
  if (codePoint >= 97 && codePoint <= 122) {
    return codePoint - 97; // 'a' - 'z'
  }
  if (codePoint >= 65 && codePoint <= 90) {
    return codePoint - 65; // 'A' - 'Z'
  }
  if (codePoint >= 48 && codePoint <= 57) {
    return codePoint - 48 + 26; // '0' - '9'
  }
  return -1;
}

/**
 * Bias adaptation function per RFC 3492 section 6.1.
 *
 * @param {number} delta Delta value.
 * @param {number} numPoints Number of code points processed so far.
 * @param {boolean} firstTime Whether this is the first adaptation step.
 * @returns {number} Adapted bias value.
 */
function adapt(delta, numPoints, firstTime) {
  let k = 0;
  let d = firstTime ? Math.floor(delta / DAMP) : Math.floor(delta / 2);
  d += Math.floor(d / numPoints);
  const cutoff = Math.floor(((BASE - TMIN) * TMAX) / 2);
  while (d > cutoff) {
    d = Math.floor(d / (BASE - TMIN));
    k += BASE;
  }
  return Math.floor(k + ((BASE - TMIN + 1) * d) / (d + SKEW));
}

/**
 * Encodes a string of Unicode code points into a Punycode payload per RFC 3492.
 * Output does NOT include the `xn--` ACE prefix.
 *
 * @param {string} input String to encode.
 * @returns {string} Punycode encoded payload.
 */
export function encodePunycode(input) {
  if (!input) return '';

  const codePoints = Array.from(input).map((char) => char.codePointAt(0));
  let output = '';

  // Copy basic code points (< 128) to output
  for (const cp of codePoints) {
    if (cp < INITIAL_N) {
      output += String.fromCharCode(cp);
    }
  }

  const b = output.length;
  let h = b;

  if (b > 0) {
    output += DELIMITER;
  }

  let n = INITIAL_N;
  let delta = 0;
  let bias = INITIAL_BIAS;

  while (h < codePoints.length) {
    let m = Infinity;
    for (const cp of codePoints) {
      if (cp >= n && cp < m) {
        m = cp;
      }
    }

    if (m === Infinity) {
      break;
    }

    delta += (m - n) * (h + 1);
    if (delta > Number.MAX_SAFE_INTEGER) {
      throw new Error('Integer overflow in Punycode encoding');
    }

    n = m;

    for (const cp of codePoints) {
      if (cp < n) {
        delta++;
        if (delta > Number.MAX_SAFE_INTEGER) {
          throw new Error('Integer overflow in Punycode encoding');
        }
      } else if (cp === n) {
        let q = delta;
        for (let k = BASE; ; k += BASE) {
          const t = Math.min(Math.max(k - bias, TMIN), TMAX);
          if (q < t) break;
          const digit = t + ((q - t) % (BASE - t));
          output += digitToChar(digit);
          q = Math.floor((q - t) / (BASE - t));
        }
        output += digitToChar(q);
        bias = adapt(delta, h + 1, h === b);
        delta = 0;
        h++;
      }
    }

    delta++;
    n++;
  }

  return output;
}

/**
 * Decodes a Punycode payload (without `xn--` prefix) into a Unicode string per RFC 3492.
 *
 * @param {string} input Punycode encoded payload.
 * @returns {string} Decoded Unicode string.
 */
export function decodePunycode(input) {
  if (!input) return '';

  let n = INITIAL_N;
  let i = 0;
  let bias = INITIAL_BIAS;
  const output = [];

  const lastDelimiter = input.lastIndexOf(DELIMITER);
  let p = 0;

  if (lastDelimiter >= 0) {
    for (let j = 0; j < lastDelimiter; j++) {
      const codePoint = input.charCodeAt(j);
      if (codePoint >= INITIAL_N) {
        throw new Error(`Invalid basic character 0x${codePoint.toString(16)} in ACE payload`);
      }
      output.push(codePoint);
    }
    p = lastDelimiter + 1;
  }

  while (p < input.length) {
    const oldi = i;
    let w = 1;

    for (let k = BASE; ; k += BASE) {
      if (p >= input.length) {
        throw new Error('Unterminated encoded sequence in ACE payload');
      }

      const charCode = input.charCodeAt(p++);
      const digit = charToDigit(charCode);

      if (digit < 0) {
        throw new Error(
          `Invalid base-36 digit character '${String.fromCharCode(charCode)}' in ACE payload`,
        );
      }

      i += digit * w;
      if (i > Number.MAX_SAFE_INTEGER) {
        throw new Error('Integer overflow in Punycode decoding');
      }

      const t = Math.min(Math.max(k - bias, TMIN), TMAX);
      if (digit < t) {
        break;
      }

      w *= BASE - t;
      if (w > Number.MAX_SAFE_INTEGER) {
        throw new Error('Integer overflow in Punycode decoding');
      }
    }

    const numPoints = output.length + 1;
    bias = adapt(i - oldi, numPoints, oldi === 0);

    n += Math.floor(i / numPoints);
    if (n > 0x10ffff) {
      throw new Error(`Decoded code point U+${n.toString(16).toUpperCase()} exceeds Unicode limit`);
    }

    i %= numPoints;
    output.splice(i, 0, n);
    i++;
  }

  return String.fromCodePoint(...output);
}

const SCRIPT_DEFINITIONS = [
  { name: 'Latin', regex: /^\p{Script=Latin}$/u },
  { name: 'Cyrillic', regex: /^\p{Script=Cyrillic}$/u },
  { name: 'Greek', regex: /^\p{Script=Greek}$/u },
  { name: 'Hebrew', regex: /^\p{Script=Hebrew}$/u },
  { name: 'Arabic', regex: /^\p{Script=Arabic}$/u },
  { name: 'Devanagari', regex: /^\p{Script=Devanagari}$/u },
  { name: 'Han', regex: /^\p{Script=Han}$/u },
  { name: 'Hiragana', regex: /^\p{Script=Hiragana}$/u },
  { name: 'Katakana', regex: /^\p{Script=Katakana}$/u },
  { name: 'Hangul', regex: /^\p{Script=Hangul}$/u },
  { name: 'Thai', regex: /^\p{Script=Thai}$/u },
  { name: 'Armenian', regex: /^\p{Script=Armenian}$/u },
  { name: 'Georgian', regex: /^\p{Script=Georgian}$/u },
  { name: 'Bengali', regex: /^\p{Script=Bengali}$/u },
  { name: 'Gujarati', regex: /^\p{Script=Gujarati}$/u },
  { name: 'Gurmukhi', regex: /^\p{Script=Gurmukhi}$/u },
  { name: 'Kannada', regex: /^\p{Script=Kannada}$/u },
  { name: 'Malayalam', regex: /^\p{Script=Malayalam}$/u },
  { name: 'Tamil', regex: /^\p{Script=Tamil}$/u },
  { name: 'Telugu', regex: /^\p{Script=Telugu}$/u },
  { name: 'Khmer', regex: /^\p{Script=Khmer}$/u },
  { name: 'Lao', regex: /^\p{Script=Lao}$/u },
  { name: 'Myanmar', regex: /^\p{Script=Myanmar}$/u },
  { name: 'Sinhala', regex: /^\p{Script=Sinhala}$/u },
  { name: 'Tibetan', regex: /^\p{Script=Tibetan}$/u },
  { name: 'Ethiopic', regex: /^\p{Script=Ethiopic}$/u },
  { name: 'Cherokee', regex: /^\p{Script=Cherokee}$/u },
  { name: 'Canadian_Aboriginal', regex: /^\p{Script=Canadian_Aboriginal}$/u },
];

/**
 * Standard augmented script groups per Unicode IDNA recommendations.
 * Scripts in these groups can co-occur within a label without triggering homograph warnings.
 */
const AUGMENTED_SCRIPT_GROUPS = [
  new Set(['Han', 'Hiragana', 'Katakana']), // Japanese
  new Set(['Hangul', 'Han']),              // Korean
  new Set(['Han', 'Bopomofo']),            // Chinese (Han + Bopomofo)
];

/**
 * Evaluates whether a set of detected scripts indicates a homograph risk.
 * Labels mixing multiple scripts outside single allowed script sets trigger a warning.
 *
 * @param {string[]} scripts Array of detected script names.
 * @returns {boolean} True if homograph risk is detected.
 */
export function hasHomographRisk(scripts) {
  if (!scripts || scripts.length <= 1) {
    return false;
  }

  for (const group of AUGMENTED_SCRIPT_GROUPS) {
    if (scripts.every((script) => group.has(script))) {
      return false;
    }
  }

  return true;
}

/**
 * Detects distinct non-neutral Unicode scripts in a string.
 * Common/Inherited script characters (digits, hyphens, punctuation) are ignored.
 *
 * @param {string} str Input text.
 * @returns {string[]} Sorted array of detected script names.
 */
export function detectScripts(str) {
  if (!str) return [];
  const scripts = new Set();

  for (const char of str) {
    if (/^\p{Script=Common}$/u.test(char) || /^\p{Script=Inherited}$/u.test(char)) {
      continue;
    }
    for (const { name, regex } of SCRIPT_DEFINITIONS) {
      if (regex.test(char)) {
        scripts.add(name);
        break;
      }
    }
  }

  return Array.from(scripts).sort();
}

/**
 * Splits a domain string into dot-separated labels.
 * Handles standard ASCII dot and IDNA full stop variants (。, ．, ｡).
 *
 * @param {string} domain Input domain.
 * @returns {string[]} Array of raw labels.
 */
export function splitDomainLabels(domain) {
  if (!domain) return [];
  return domain.split(/[\u002E\u3002\uFF0E\uFF61]/);
}

/**
 * Helper to calculate byte length of an ASCII string or Unicode label.
 *
 * @param {string} str Input string.
 * @returns {number} Length in UTF-8 bytes.
 */
function getByteLength(str) {
  return new TextEncoder().encode(str).length;
}

/**
 * Validates a single label record (hyphens, LDH compliance, max byte length, homograph risk)
 * and accumulates errors and warnings.
 *
 * @param {string} rawLabel Original raw label string.
 * @param {string} asciiLabel Encoded ASCII / ACE label.
 * @param {string} unicodeLabel Normalized Unicode label.
 * @param {string[]} errors Accumulated domain errors.
 * @param {string[]} warnings Accumulated domain warnings.
 * @returns {object} Label metadata object.
 */
function processLabelRecord(rawLabel, asciiLabel, unicodeLabel, errors, warnings) {
  const hasInvalidHyphen =
    rawLabel.startsWith('-') ||
    rawLabel.endsWith('-') ||
    unicodeLabel.startsWith('-') ||
    unicodeLabel.endsWith('-') ||
    asciiLabel.startsWith('-') ||
    asciiLabel.endsWith('-');

  if (hasInvalidHyphen) {
    errors.push(`Label "${rawLabel}" cannot begin or end with a hyphen.`);
  }

  const invalidLdhMatch = asciiLabel.match(/[^a-z0-9-]/i);
  if (invalidLdhMatch) {
    errors.push(
      `Label "${rawLabel}" contains character "${invalidLdhMatch[0]}" ` +
        `not allowed in a domain label.`,
    );
  }

  const asciiLen = getByteLength(asciiLabel);
  if (asciiLen > 63) {
    errors.push(
      `Encoded label "${asciiLabel}" exceeds maximum length of 63 bytes (${asciiLen} bytes).`,
    );
  }

  const scripts = detectScripts(unicodeLabel);
  const isRisk = hasHomographRisk(scripts);

  if (isRisk) {
    const scriptList = scripts.join(', ');
    warnings.push(
      `Label "${unicodeLabel}" mixes multiple scripts (${scriptList}), ` +
        `which may indicate a homograph risk.`,
    );
  }

  return {
    original: rawLabel,
    ascii: asciiLabel,
    unicode: unicodeLabel,
    asciiLength: asciiLen,
    scripts,
    hasHomographRisk: isRisk,
  };
}

/**
 * Finalizes domain conversion results after processing all labels.
 *
 * @param {object[]} labels Processed label metadata objects.
 * @param {string[]} errors Domain error messages.
 * @param {string[]} warnings Domain warning messages.
 * @returns {object} Conversion result object.
 */
function finalizeDomainResult(labels, errors, warnings) {
  const fullAscii = labels.map((l) => l.ascii).join('.');
  const fullUnicode = labels.map((l) => l.unicode).join('.');

  if (labels.length > 0 && getByteLength(fullAscii) > 253) {
    const asciiByteLen = getByteLength(fullAscii);
    errors.push(
      `Total encoded domain length (${asciiByteLen} bytes) exceeds maximum limit of 253 bytes.`,
    );
  }

  return {
    ascii: errors.length > 0 ? '' : fullAscii,
    unicode: errors.length > 0 ? '' : fullUnicode,
    labels,
    errors,
    warnings,
  };
}

/**
 * Converts a domain name from Unicode (IDN) to ASCII Punycode (ACE).
 * Applies NFC normalization, lowercase folding, per-label encoding,
 * IDNA length checks, structural validation, and homograph detection.
 *
 * @param {string} domain Input domain name.
 * @returns {object} Result object containing ascii, unicode, labels, errors, and warnings.
 */
export function toASCII(domain) {
  if (!domain || domain.trim() === '') {
    return { ascii: '', unicode: '', labels: [], errors: [], warnings: [] };
  }

  const rawLabels = splitDomainLabels(domain);
  const errors = [];
  const warnings = [];
  const labels = [];

  if (rawLabels.some((label) => label === '')) {
    errors.push('Domain contains empty label (leading, trailing, or consecutive dots).');
  }

  for (const rawLabel of rawLabels) {
    if (rawLabel === '') continue;

    const normLabel = rawLabel.normalize('NFC').toLowerCase();
    let asciiLabel = normLabel;

    if (hasNonAscii(normLabel)) {
      try {
        const payload = encodePunycode(normLabel);
        asciiLabel = `xn--${payload}`;
      } catch (err) {
        errors.push(`Failed to encode label "${rawLabel}": ${err.message}`);
      }
    }

    labels.push(processLabelRecord(rawLabel, asciiLabel, normLabel, errors, warnings));
  }

  return finalizeDomainResult(labels, errors, warnings);
}

/**
 * Converts a domain name from ASCII Punycode (ACE) to Unicode (IDN).
 * Applies per-label Punycode decoding, IDNA length checks,
 * structural validation, and homograph detection.
 *
 * @param {string} domain Input ASCII ACE domain.
 * @returns {object} Result object containing ascii, unicode, labels, errors, and warnings.
 */
export function toUnicode(domain) {
  if (!domain || domain.trim() === '') {
    return { ascii: '', unicode: '', labels: [], errors: [], warnings: [] };
  }

  const rawLabels = splitDomainLabels(domain);
  const errors = [];
  const warnings = [];
  const labels = [];

  if (rawLabels.some((label) => label === '')) {
    errors.push('Domain contains empty label (leading, trailing, or consecutive dots).');
  }

  for (const rawLabel of rawLabels) {
    if (rawLabel === '') continue;

    const lowerRaw = rawLabel.toLowerCase();
    let asciiLabel = lowerRaw;
    let unicodeLabel = lowerRaw;

    if (lowerRaw.startsWith('xn--')) {
      const payload = lowerRaw.slice(4);
      if (payload === '') {
        errors.push(`ACE label "${rawLabel}" has an empty payload.`);
      } else {
        try {
          unicodeLabel = decodePunycode(payload).normalize('NFC');
        } catch (err) {
          errors.push(`Failed to decode ACE label "${rawLabel}": ${err.message}`);
        }
      }
    } else {
      unicodeLabel = rawLabel.normalize('NFC').toLowerCase();
      if (hasNonAscii(unicodeLabel)) {
        try {
          asciiLabel = `xn--${encodePunycode(unicodeLabel)}`;
        } catch (err) {
          errors.push(`Failed to encode label "${rawLabel}": ${err.message}`);
        }
      }
    }

    labels.push(processLabelRecord(rawLabel, asciiLabel, unicodeLabel, errors, warnings));
  }

  return finalizeDomainResult(labels, errors, warnings);
}
