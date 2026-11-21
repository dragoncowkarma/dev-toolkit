/**
 * Ensures a byte range is fully available before a parser reads it.
 *
 * @param {Uint8Array} bytes Source bytes.
 * @param {number} offset Starting offset.
 * @param {number} length Number of required bytes.
 * @returns {boolean} Whether the requested range is available.
 */
export function requirePacketBytes(bytes, offset, length) {
  return (
    Object.prototype.toString.call(bytes) === '[object Uint8Array]' &&
    Number.isSafeInteger(offset) &&
    Number.isSafeInteger(length) &&
    offset >= 0 &&
    length >= 0 &&
    offset <= bytes.length - length
  );
}

/**
 * Decodes a whitespace-separated hexadecimal PDF payload.
 *
 * @param {string} input Hexadecimal text.
 * @returns {{bytes: Uint8Array}|{error: string}}
 */
export function decodePdfHex(input) {
  if (typeof input !== 'string') return { error: 'Hex input must be text.' };
  const compact = input.replace(/\s/g, '');
  if (!compact) return { error: 'Paste PDF bytes as hexadecimal text.' };
  if (compact.length % 2 !== 0 || !/^[\da-f]+$/i.test(compact)) {
    return { error: 'Hex input must contain complete byte pairs (00–FF).' };
  }
  const bytes = new Uint8Array(compact.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(compact.slice(index * 2, index * 2 + 2), 16);
  }
  return { bytes };
}

function undecoded(error) {
  return { status: 'undecoded', error };
}

function bytesToPdfText(bytes) {
  let text = '';
  for (const byte of bytes) text += String.fromCharCode(byte);
  return text;
}

function extractDictionary(text, start) {
  const dictionaryStart = text.indexOf('<<', start);
  if (dictionaryStart < 0) return null;
  let depth = 0;
  for (let index = dictionaryStart; index < text.length - 1; index += 1) {
    const pair = text.slice(index, index + 2);
    if (pair === '<<') {
      depth += 1;
      index += 1;
    } else if (pair === '>>') {
      depth -= 1;
      index += 1;
      if (depth === 0) return text.slice(dictionaryStart, index + 1);
    }
  }
  return null;
}

function parseClassicXref(text, startOffset) {
  const section = text.slice(startOffset);
  const lines = section.split(/\r?\n/);
  if (lines.shift()?.trim() !== 'xref') return null;
  const entries = [];
  let lineIndex = 0;
  while (lineIndex < lines.length) {
    const line = lines[lineIndex].trim();
    if (line === 'trailer') {
      const dictionary = extractDictionary(section, section.indexOf('trailer'));
      if (!dictionary) return { error: 'The xref trailer dictionary is truncated.' };
      return { entries, dictionary };
    }
    const subsection = /^(\d+)\s+(\d+)$/.exec(line);
    if (!subsection) return { error: 'Could not parse a classic xref subsection.' };
    const firstObject = Number(subsection[1]);
    const count = Number(subsection[2]);
    lineIndex += 1;
    for (let index = 0; index < count; index += 1) {
      const entryLine = lines[lineIndex + index]?.trim();
      const entry = /^(\d{10})\s+(\d{5})\s+([nf])\b/.exec(entryLine ?? '');
      if (!entry) return { error: 'The xref table is truncated or malformed.' };
      entries.push({
        objectNumber: firstObject + index,
        offset: Number(entry[1]),
        generation: Number(entry[2]),
        inUse: entry[3] === 'n',
        flag: entry[3],
      });
    }
    lineIndex += count;
  }
  return { error: 'The xref table has no trailer.' };
}

function trailerFields(dictionary) {
  const root = /\/Root\s+(\d+\s+\d+\s+R)\b/.exec(dictionary)?.[1] ?? null;
  const size = /\/Size\s+(\d+)\b/.exec(dictionary)?.[1] ?? null;
  const previous = /\/Prev\s+(\d+)\b/.exec(dictionary)?.[1] ?? null;
  return {
    dictionary,
    root,
    size: size === null ? null : Number(size),
    previous: previous === null ? null : Number(previous),
  };
}

/**
 * Parses the file-level structures of a PDF without interpreting objects or streams.
 *
 * @param {Uint8Array} bytes PDF file bytes.
 * @returns {object} Parsed metadata or a safe undecoded result.
 */
export function parsePdfBytes(bytes) {
  try {
    if (!requirePacketBytes(bytes, 0, 8)) return undecoded('Input is too short for a PDF header.');
    const text = bytesToPdfText(bytes);
    const header = /^%PDF-(\d\.\d)\b/.exec(text);
    if (!header) return undecoded('Could not find a %PDF-x.y header signature.');
    const eofOffset = text.lastIndexOf('%%EOF');
    if (eofOffset < 0) return undecoded('Could not find the %%EOF marker.');
    const startxrefMatches = [...text.matchAll(/startxref\s*(\d+)\s*%%EOF/g)];
    const startxref = startxrefMatches.at(-1);
    if (!startxref) return undecoded('Could not find a startxref offset before %%EOF.');
    const xrefOffset = Number(startxref[1]);
    if (!requirePacketBytes(bytes, xrefOffset, 1)) {
      return undecoded('The startxref offset points outside the supplied input.');
    }

    const firstObjectEnd = text.indexOf('endobj');
    const firstObject = firstObjectEnd < 0 ? text.slice(0, 1024) : text.slice(0, firstObjectEnd);
    const common = {
      status: 'parsed',
      version: header[1],
      startxref: xrefOffset,
      eofOffset,
      hasLinearizationHint: /\/Linearized\b/.test(firstObject),
    };
    const atOffset = text.slice(xrefOffset);
    if (/^\s*xref\b/.test(atOffset)) {
      const xrefStart = xrefOffset + (atOffset.search(/xref\b/));
      const classic = parseClassicXref(text, xrefStart);
      if (classic?.error) return undecoded(classic.error);
      return {
        ...common,
        xrefType: 'classic',
        xrefEntries: classic.entries,
        trailer: trailerFields(classic.dictionary),
      };
    }

    const xrefWindow = text.slice(xrefOffset, Math.min(text.length, xrefOffset + 2048));
    const streamDictionary = extractDictionary(xrefWindow, 0);
    if (streamDictionary && /\/Type\s*\/XRef\b/.test(streamDictionary)) {
      return {
        ...common,
        xrefType: 'stream',
        xrefEntries: [],
        trailer: trailerFields(streamDictionary),
        notice: 'Cross-reference stream detected. Compressed stream entries are not parsed.',
      };
    }
    return undecoded('startxref does not point to a classic xref table or xref stream.');
  } catch (error) {
    const message = error instanceof Error ? ` (${error.message})` : '';
    return undecoded(`Could not parse this PDF safely.${message}`);
  }
}
