/**
 * Split text into lines, standardizing CRLF/CR to LF or using a custom delimiter.
 *
 * @param {string} text - The input text to split.
 * @param {string} [splitDelimiter=''] - Custom delimiter if custom split enabled.
 * @param {boolean} [enableCustomSplit=false] - Whether custom split is active.
 * @returns {string[]} Array of split lines.
 */
export function splitLines(text, splitDelimiter = '', enableCustomSplit = false) {
  if (!text) return [];
  const normalized = text.replace(/\r\n|\r/g, '\n');
  if (enableCustomSplit && splitDelimiter) {
    return normalized.split(splitDelimiter);
  }
  return normalized.split('\n');
}

/**
 * Trim leading and trailing whitespace from each line.
 *
 * @param {string[]} lines - Array of lines.
 * @returns {string[]} Trimmed lines.
 */
export function trimLines(lines) {
  return lines.map((line) => line.trim());
}

/**
 * Filter out empty lines from an array of lines.
 *
 * @param {string[]} lines - Array of lines.
 * @returns {string[]} Non-empty lines.
 */
export function removeEmptyLines(lines) {
  return lines.filter((line) => line.length > 0);
}

/**
 * Remove duplicate lines while preserving order of first appearance.
 *
 * @param {string[]} lines - Array of lines.
 * @param {boolean} [caseSensitive=true] - Whether comparison is case sensitive.
 * @returns {{ lines: string[], removedCount: number }} Deduplicated lines and removed count.
 */
export function deduplicateLines(lines, caseSensitive = true) {
  const seen = new Set();
  const result = [];
  let removedCount = 0;

  for (const line of lines) {
    const key = caseSensitive ? line : line.toLowerCase();
    if (seen.has(key)) {
      removedCount += 1;
    } else {
      seen.add(key);
      result.push(line);
    }
  }

  return { lines: result, removedCount };
}

/**
 * Sort lines lexicographically or naturally.
 *
 * @param {string[]} lines - Array of lines.
 * @param {object} [options={}] - Sort options.
 * @param {'none'|'asc'|'desc'} [options.sortMode='none'] - Sort direction.
 * @param {boolean} [options.naturalSort=false] - Use natural numerical sorting.
 * @param {boolean} [options.caseSensitive=true] - Respect letter case.
 * @returns {string[]} Sorted array of lines.
 */
export function sortLines(lines, options = {}) {
  const { sortMode = 'none', naturalSort = false, caseSensitive = true } = options;
  if (sortMode === 'none') return [...lines];

  const sorted = [...lines].sort((a, b) => {
    let cmp = 0;
    if (naturalSort) {
      const sensitivity = caseSensitive ? 'variant' : 'base';
      cmp = a.localeCompare(b, undefined, { numeric: true, sensitivity });
    } else if (caseSensitive) {
      cmp = a < b ? -1 : a > b ? 1 : 0;
    } else {
      const lowerA = a.toLowerCase();
      const lowerB = b.toLowerCase();
      cmp = lowerA < lowerB ? -1 : lowerA > lowerB ? 1 : 0;
    }
    return sortMode === 'desc' ? -cmp : cmp;
  });

  return sorted;
}

/**
 * Reverse the order of lines.
 *
 * @param {string[]} lines - Array of lines.
 * @returns {string[]} Reversed array of lines.
 */
export function reverseLines(lines) {
  return [...lines].reverse();
}

/**
 * Decorate lines with line numbers, prefixes, and suffixes.
 *
 * @param {string[]} lines - Array of lines.
 * @param {object} [options={}] - Decorate options.
 * @param {string} [options.prefix=''] - Prefix to prepend.
 * @param {string} [options.suffix=''] - Suffix to append.
 * @param {boolean} [options.numberLines=false] - Whether to add line numbers.
 * @param {number} [options.startNumber=1] - Starting line number.
 * @returns {string[]} Decorated array of lines.
 */
export function decorateLines(lines, options = {}) {
  const { prefix = '', suffix = '', numberLines = false, startNumber = 1 } = options;
  const validStart = Number.isInteger(Number(startNumber)) ? Number(startNumber) : 1;

  return lines.map((line, index) => {
    const numPrefix = numberLines ? `${validStart + index}. ` : '';
    return `${numPrefix}${prefix}${line}${suffix}`;
  });
}

/**
 * Join lines with a specified delimiter.
 *
 * @param {string[]} lines - Array of lines.
 * @param {string} [delimiter='\n'] - Delimiter used to join lines.
 * @returns {string} Joined string.
 */
export function joinLines(lines, delimiter = '\n') {
  return lines.join(delimiter);
}

/**
 * Process input text through the line operations pipeline.
 *
 * @param {string} input - Raw input text.
 * @param {object} [options={}] - Processing options.
 * @returns {object} Summary object with output string and statistics.
 */
export function processLines(input, options = {}) {
  const {
    enableCustomSplit = false,
    splitDelimiter = '',
    trim = false,
    removeEmpty = false,
    dedupe = false,
    dedupeIgnoreCase = false,
    sortMode = 'none',
    naturalSort = false,
    caseSensitive = true,
    reverse = false,
    numberLines = false,
    startNumber = 1,
    prefix = '',
    suffix = '',
    joinDelimiter = '\n',
  } = options;

  if (!input) {
    return {
      output: '',
      originalLineCount: 0,
      originalCharCount: 0,
      outputLineCount: 0,
      outputCharCount: 0,
      removedDuplicatesCount: 0,
    };
  }

  let lines = splitLines(input, splitDelimiter, enableCustomSplit);
  const originalLineCount = lines.length;
  const originalCharCount = input.length;

  if (trim) {
    lines = trimLines(lines);
  }

  if (removeEmpty) {
    lines = removeEmptyLines(lines);
  }

  let removedDuplicatesCount = 0;
  if (dedupe) {
    const dedupeResult = deduplicateLines(lines, !dedupeIgnoreCase);
    lines = dedupeResult.lines;
    removedDuplicatesCount = dedupeResult.removedCount;
  }

  if (sortMode !== 'none') {
    lines = sortLines(lines, { sortMode, naturalSort, caseSensitive });
  }

  if (reverse) {
    lines = reverseLines(lines);
  }

  if (numberLines || prefix || suffix) {
    lines = decorateLines(lines, { prefix, suffix, numberLines, startNumber });
  }

  const output = joinLines(lines, joinDelimiter);
  const outputLineCount = lines.length;
  const outputCharCount = output.length;

  return {
    output,
    originalLineCount,
    originalCharCount,
    outputLineCount,
    outputCharCount,
    removedDuplicatesCount,
  };
}
