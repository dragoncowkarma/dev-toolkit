/**
 * MIME Type Inspector utility module.
 * Parses, normalizes, validates, and categorizes Content-Type header values
 * and standalone media types.
 */

// HTTP Token characters according to RFC 7230 / RFC 2045:
// 1 or more ASCII characters excluding control chars and tspecials/separators
// ()<>@,;:\"/[]?={} spaces and TABs.
const HTTP_TOKEN_REGEX = /^[a-zA-Z0-9!#$%&'*+._`|~-]+$/;

// Standard/common charsets recognized in web standards
const KNOWN_CHARSETS = new Set([
  'utf-8',
  'utf-16',
  'utf-16be',
  'utf-16le',
  'us-ascii',
  'iso-8859-1',
  'iso-8859-2',
  'iso-8859-15',
  'windows-1252',
  'shift_jis',
  'euc-jp',
  'euc-kr',
  'big5',
  'gbk',
  'gb18030',
  'ansi_x3.4-1968',
]);

/**
 * Common developer-facing MIME type lookup dictionary.
 * Maps exact lowercased type/subtype strings to category and safe handling guidance.
 */
export const COMMON_MIME_TYPES = {
  'application/json': {
    category: 'Structured Data',
    handlingNote:
      'Standard format for structured data interchange; parse safely using JSON.parse().',
  },
  'application/xml': {
    category: 'Markup / Structured Data',
    handlingNote:
      'Extensible Markup Language; guard against XML External Entity (XXE) vulnerabilities.',
  },
  'text/xml': {
    category: 'Markup / Structured Data',
    handlingNote:
      'Extensible Markup Language; guard against XML External Entity (XXE) vulnerabilities.',
  },
  'text/html': {
    category: 'Web Document',
    handlingNote:
      'Hypertext Markup Language; sanitize untrusted input before DOM insertion.',
  },
  'text/css': {
    category: 'Stylesheet',
    handlingNote: 'Cascading Style Sheets; used for styling web documents.',
  },
  'text/javascript': {
    category: 'Script',
    handlingNote: 'Executable JavaScript code; execute only from trusted origins.',
  },
  'application/javascript': {
    category: 'Script',
    handlingNote: 'Executable JavaScript code; execute only from trusted origins.',
  },
  'application/x-javascript': {
    category: 'Script',
    handlingNote: 'Legacy JavaScript media type; execute only from trusted origins.',
  },
  'image/svg+xml': {
    category: 'Vector Image',
    handlingNote:
      'XML-based vector image format; may contain embedded scripts or styles ' +
      'requiring sanitization.',
  },
  'application/pdf': {
    category: 'Document',
    handlingNote: 'Portable Document Format; requires a dedicated PDF viewer or renderer.',
  },
  'application/zip': {
    category: 'Archive',
    handlingNote:
      'Compressed archive container; inspect extracted entries for path traversal risks.',
  },
  'application/x-zip-compressed': {
    category: 'Archive',
    handlingNote:
      'Compressed archive container; inspect extracted entries for path traversal risks.',
  },
  'application/wasm': {
    category: 'Binary Executable',
    handlingNote: 'WebAssembly binary format for high-performance client-side execution.',
  },
  'application/x-www-form-urlencoded': {
    category: 'Form Data',
    handlingNote: 'URL-encoded key-value pairs used in standard HTTP POST form submissions.',
  },
  'multipart/form-data': {
    category: 'Form Data',
    handlingNote:
      'Multipart container for file uploads; requires a "boundary" parameter.',
  },
  'image/jpeg': {
    category: 'Raster Image',
    handlingNote: 'JPEG compressed photographic image format.',
  },
  'image/png': {
    category: 'Raster Image',
    handlingNote: 'PNG lossless raster image format supporting alpha transparency.',
  },
  'image/gif': {
    category: 'Raster Image',
    handlingNote: 'GIF image format supporting indexed color and basic animation.',
  },
  'image/webp': {
    category: 'Raster Image',
    handlingNote: 'Modern WebP image format with lossy and lossless compression.',
  },
  'image/avif': {
    category: 'Raster Image',
    handlingNote: 'AV1-based high efficiency image format.',
  },
  'image/apng': {
    category: 'Raster Image',
    handlingNote: 'Animated Portable Network Graphics format.',
  },
  'font/woff': {
    category: 'Font',
    handlingNote: 'Web Open Font Format 1.0.',
  },
  'application/font-woff': {
    category: 'Font',
    handlingNote: 'Legacy Web Open Font Format 1.0 identifier.',
  },
  'font/woff2': {
    category: 'Font',
    handlingNote: 'Web Open Font Format 2.0 with Brotli compression.',
  },
  'font/ttf': {
    category: 'Font',
    handlingNote: 'TrueType Font format.',
  },
  'application/x-font-ttf': {
    category: 'Font',
    handlingNote: 'TrueType Font legacy media type format.',
  },
  'font/otf': {
    category: 'Font',
    handlingNote: 'OpenType Font format.',
  },
  'application/x-font-opentype': {
    category: 'Font',
    handlingNote: 'OpenType Font legacy media type format.',
  },
  'text/plain': {
    category: 'Plain Text',
    handlingNote: 'Unformatted text file; generally safe to render as text content.',
  },
  'application/octet-stream': {
    category: 'Binary Stream',
    handlingNote: 'Arbitrary binary byte stream; used as default download fallback.',
  },
};

/**
 * Checks if a string is a valid HTTP token according to RFC specs.
 *
 * @param {string} str - Candidate string.
 * @returns {boolean} True if valid token.
 */
export function isHttpToken(str) {
  return typeof str === 'string' && str.length > 0 && HTTP_TOKEN_REGEX.test(str);
}

/**
 * Quotes a parameter value if necessary for MIME serialization.
 *
 * @param {string} val - Parameter value.
 * @returns {string} Serialized value.
 */
export function formatParamValue(val) {
  if (isHttpToken(val)) {
    return val;
  }
  const escaped = val.replace(/["\\]/g, '\\$&');
  return `"${escaped}"`;
}

/**
 * Extracts structured registration tree from a lowercased subtype.
 *
 * @param {string} subtype - Lowercased subtype.
 * @returns {string} Human-readable tree name.
 */
export function extractRegistrationTree(subtype) {
  if (!subtype) return 'Unknown';
  if (subtype.startsWith('vnd.')) return 'Vendor Tree (vnd.)';
  if (subtype.startsWith('prs.')) return 'Personal Tree (prs.)';
  if (subtype.startsWith('x.') || subtype.startsWith('x-')) {
    return 'Unregistered / Experimental Tree';
  }
  return 'Standards Tree';
}

/**
 * Extracts structured syntax suffix (e.g. +json, +xml) from a lowercased subtype.
 *
 * @param {string} subtype - Lowercased subtype.
 * @returns {string|null} Suffix without plus, or null if none.
 */
export function extractStructuredSuffix(subtype) {
  if (!subtype) return null;
  const plusIdx = subtype.lastIndexOf('+');
  if (plusIdx !== -1 && plusIdx < subtype.length - 1) {
    return subtype.slice(plusIdx + 1);
  }
  return null;
}

/**
 * Splits a string on top-level semicolons, ignoring semicolons within double quotes.
 *
 * @param {string} paramStr - Full parameter string section.
 * @returns {string[]} Parameter segments.
 */
function splitTopLevelSemicolons(paramStr) {
  const segments = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < paramStr.length; i += 1) {
    const char = paramStr[i];
    if (char === '"' && (i === 0 || paramStr[i - 1] !== '\\')) {
      inQuotes = !inQuotes;
      current += char;
    } else if (char === ';' && !inQuotes) {
      segments.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  if (inQuotes) {
    throw new Error('Malformed quoted string in parameters: unclosed double quote.');
  }

  segments.push(current);
  return segments;
}

/**
 * Parses a parameter value string. Handles quoted strings and escaped characters.
 *
 * @param {string} rawVal - Raw value portion after '='.
 * @param {string} paramName - Lowercased parameter name for error messages.
 * @returns {{ value: string, isQuoted: boolean }} Parsed value object.
 */
function parseParameterValue(rawVal, paramName) {
  if (rawVal.startsWith('"')) {
    if (rawVal.length < 2) {
      throw new Error(
        `Malformed quoted string for parameter "${paramName}": unclosed double quote.`,
      );
    }

    let unescaped = '';
    let closed = false;
    let endIdx = -1;

    for (let i = 1; i < rawVal.length; i += 1) {
      const char = rawVal[i];
      if (char === '\\') {
        if (i + 1 >= rawVal.length) {
          throw new Error(
            `Malformed quoted string for parameter "${paramName}": trailing backslash.`,
          );
        }
        unescaped += rawVal[i + 1];
        i += 1;
      } else if (char === '"') {
        closed = true;
        endIdx = i;
        break;
      } else {
        unescaped += char;
      }
    }

    if (!closed) {
      throw new Error(
        `Malformed quoted string for parameter "${paramName}": unclosed double quote.`,
      );
    }

    const remainder = rawVal.slice(endIdx + 1).trim();
    if (remainder.length > 0) {
      throw new Error(
        `Malformed quoted string for parameter "${paramName}": extra characters after quote.`,
      );
    }

    return { value: unescaped, isQuoted: true };
  }

  if (rawVal === '') {
    throw new Error(`Invalid parameter value for "${paramName}": unquoted value cannot be empty.`);
  }

  if (!isHttpToken(rawVal)) {
    throw new Error(
      `Invalid parameter value for "${paramName}": value contains characters requiring quotes.`,
    );
  }

  return { value: rawVal, isQuoted: false };
}

/**
 * Helper to build standard error result object.
 */
function buildErrorResult(errorMsg, rawInput, isHeaderLine, headerPrefix) {
  return {
    isValid: false,
    error: errorMsg,
    rawInput,
    isHeaderLine,
    headerPrefix,
    type: null,
    subtype: null,
    fullType: null,
    tree: null,
    suffix: null,
    parameters: [],
    parameterMap: {},
    canonical: null,
    isKnown: false,
    category: null,
    handlingNote: null,
    warnings: [],
  };
}

/**
 * Parses a media type or Content-Type header value.
 *
 * @param {string} input - Raw input string.
 * @returns {object} Structured analysis result.
 */
export function parseMimeType(input) {
  const rawInput = typeof input === 'string' ? input : '';
  const trimmedInput = rawInput.trim();

  if (!trimmedInput) {
    return buildErrorResult(
      'Please enter a MIME type or Content-Type header value.',
      rawInput,
      false,
      null,
    );
  }

  let workingStr = trimmedInput;
  let isHeaderLine = false;
  let headerPrefix = null;

  const headerMatch = workingStr.match(/^content-type\s*:\s*/i);
  if (headerMatch) {
    isHeaderLine = true;
    headerPrefix = headerMatch[0].trim();
    workingStr = workingStr.slice(headerMatch[0].length).trim();
  }

  if (!workingStr) {
    return buildErrorResult(
      'Content-Type header value is empty.',
      rawInput,
      isHeaderLine,
      headerPrefix,
    );
  }

  let firstSemiIdx = -1;
  let inQuotes = false;
  for (let i = 0; i < workingStr.length; i += 1) {
    const char = workingStr[i];
    if (char === '"' && (i === 0 || workingStr[i - 1] !== '\\')) {
      inQuotes = !inQuotes;
    } else if (char === ';' && !inQuotes) {
      firstSemiIdx = i;
      break;
    }
  }

  const mediaTypePart = (
    firstSemiIdx === -1 ? workingStr : workingStr.slice(0, firstSemiIdx)
  ).trim();
  const paramPart = firstSemiIdx === -1 ? '' : workingStr.slice(firstSemiIdx + 1);

  const slashIdx = mediaTypePart.indexOf('/');
  if (slashIdx === -1) {
    return buildErrorResult(
      `Invalid MIME type "${mediaTypePart}": missing type/subtype separator "/".`,
      rawInput,
      isHeaderLine,
      headerPrefix,
    );
  }

  if (mediaTypePart.slice(slashIdx + 1).includes('/')) {
    return buildErrorResult(
      `Invalid MIME type "${mediaTypePart}": contains extra "/" character.`,
      rawInput,
      isHeaderLine,
      headerPrefix,
    );
  }

  const rawType = mediaTypePart.slice(0, slashIdx);
  const rawSubtype = mediaTypePart.slice(slashIdx + 1);

  if (!rawType.trim()) {
    return buildErrorResult(
      'Invalid MIME type: type cannot be empty.',
      rawInput,
      isHeaderLine,
      headerPrefix,
    );
  }

  if (!rawSubtype.trim()) {
    return buildErrorResult(
      'Invalid MIME type: subtype cannot be empty.',
      rawInput,
      isHeaderLine,
      headerPrefix,
    );
  }

  if (!isHttpToken(rawType)) {
    return buildErrorResult(
      `Invalid type token "${rawType}": contains invalid syntax characters.`,
      rawInput,
      isHeaderLine,
      headerPrefix,
    );
  }

  if (!isHttpToken(rawSubtype)) {
    return buildErrorResult(
      `Invalid subtype token "${rawSubtype}": contains invalid syntax characters.`,
      rawInput,
      isHeaderLine,
      headerPrefix,
    );
  }

  const type = rawType.toLowerCase();
  const subtype = rawSubtype.toLowerCase();
  const fullType = `${type}/${subtype}`;

  const parameters = [];
  const parameterMap = {};
  const seenParamNames = new Set();
  const warnings = [];

  if (paramPart.trim().length > 0) {
    let paramSegments;
    try {
      paramSegments = splitTopLevelSemicolons(paramPart);
    } catch (err) {
      return buildErrorResult(err.message, rawInput, isHeaderLine, headerPrefix);
    }

    for (let idx = 0; idx < paramSegments.length; idx += 1) {
      const seg = paramSegments[idx].trim();
      if (!seg) {
        if (idx === paramSegments.length - 1) {
          continue;
        }
        return buildErrorResult(
          'Malformed parameters: empty parameter segment found between semicolons.',
          rawInput,
          isHeaderLine,
          headerPrefix,
        );
      }

      const eqIdx = seg.indexOf('=');
      if (eqIdx === -1) {
        return buildErrorResult(
          `Malformed parameter "${seg}": missing "=" assignment.`,
          rawInput,
          isHeaderLine,
          headerPrefix,
        );
      }

      const paramNameRaw = seg.slice(0, eqIdx).trim();
      const paramValRaw = seg.slice(eqIdx + 1).trim();

      if (!paramNameRaw) {
        return buildErrorResult(
          `Malformed parameter "${seg}": missing parameter name before "=".`,
          rawInput,
          isHeaderLine,
          headerPrefix,
        );
      }

      if (!isHttpToken(paramNameRaw)) {
        return buildErrorResult(
          `Invalid parameter name "${paramNameRaw}": contains invalid syntax characters.`,
          rawInput,
          isHeaderLine,
          headerPrefix,
        );
      }

      const paramName = paramNameRaw.toLowerCase();

      if (seenParamNames.has(paramName)) {
        return buildErrorResult(
          `Duplicate parameter name "${paramName}". Parameter names must be unique.`,
          rawInput,
          isHeaderLine,
          headerPrefix,
        );
      }
      seenParamNames.add(paramName);

      let parsedVal;
      try {
        parsedVal = parseParameterValue(paramValRaw, paramName);
      } catch (err) {
        return buildErrorResult(err.message, rawInput, isHeaderLine, headerPrefix);
      }

      parameters.push({
        name: paramName,
        value: parsedVal.value,
        raw: seg,
        isQuoted: parsedVal.isQuoted,
      });
      parameterMap[paramName] = parsedVal.value;

      if (paramName === 'charset') {
        const charsetLower = parsedVal.value.toLowerCase();
        if (!charsetLower) {
          return buildErrorResult(
            'Invalid charset parameter: charset value cannot be empty.',
            rawInput,
            isHeaderLine,
            headerPrefix,
          );
        }
        if (!KNOWN_CHARSETS.has(charsetLower)) {
          warnings.push(
            `Non-standard charset "${parsedVal.value}". ` +
            '"utf-8" is recommended for web interoperability.',
          );
        }
      }
    }
  }

  if (fullType === 'multipart/form-data' && !parameterMap.boundary) {
    warnings.push(
      'multipart/form-data usually requires a "boundary" parameter for delimiter specification.',
    );
  }

  let canonical = fullType;
  for (const p of parameters) {
    canonical += `; ${p.name}=${formatParamValue(p.value)}`;
  }

  const knownMatch = COMMON_MIME_TYPES[fullType];
  const isKnown = Boolean(knownMatch);
  const category = knownMatch ? knownMatch.category : 'Unrecognized / Custom';
  const handlingNote = knownMatch
    ? knownMatch.handlingNote
    : 'Syntactically valid media type, but not in the standard developer lookup table.';

  const tree = extractRegistrationTree(subtype);
  const suffix = extractStructuredSuffix(subtype);

  return {
    isValid: true,
    error: null,
    rawInput,
    isHeaderLine,
    headerPrefix,
    type,
    subtype,
    fullType,
    tree,
    suffix,
    parameters,
    parameterMap,
    canonical,
    isKnown,
    category,
    handlingNote,
    warnings,
  };
}

/**
 * Serializes the parsed MIME analysis result into a clean JSON string for export.
 *
 * @param {object} parsed - Result of parseMimeType.
 * @returns {string} Formatted JSON string.
 */
export function toJSONRepresentation(parsed) {
  if (!parsed || !parsed.isValid) {
    return JSON.stringify(
      { isValid: false, error: parsed?.error || 'Invalid MIME type' },
      null,
      2,
    );
  }

  const exportObj = {
    rawInput: parsed.rawInput,
    isHeaderLine: parsed.isHeaderLine,
    canonical: parsed.canonical,
    type: parsed.type,
    subtype: parsed.subtype,
    fullType: parsed.fullType,
    tree: parsed.tree,
    suffix: parsed.suffix,
    parameters: parsed.parameterMap,
    isKnown: parsed.isKnown,
    category: parsed.category,
    handlingNote: parsed.handlingNote,
    warnings: parsed.warnings,
  };

  return JSON.stringify(exportObj, null, 2);
}
