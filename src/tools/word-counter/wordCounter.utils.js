/**
 * Computes word count in a given text.
 * Whitespace and punctuation aware, ignoring multiple spaces, tabs, or newlines.
 *
 * @param {string} text - Input string to analyze.
 * @returns {number} The total number of words.
 */
export function getWordCount(text) {
  if (typeof text !== 'string' || !text) return 0;
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

/**
 * Computes character count in a given text.
 *
 * @param {string} text - Input string to analyze.
 * @param {boolean} [includeWhitespace=true] - Whether to include whitespace characters.
 * @returns {number} The total character count.
 */
export function getCharacterCount(text, includeWhitespace = true) {
  if (typeof text !== 'string' || !text) return 0;
  if (includeWhitespace) {
    return Array.from(text).length;
  }
  return Array.from(text.replace(/\s/g, '')).length;
}

/**
 * Computes sentence count in a given text.
 *
 * Known limitations: Sentences are split on terminal punctuation (.!?). Common
 * titles and abbreviations (e.g., Mr., Mrs., Dr., vs., etc., e.g., i.e.) and decimal
 * numbers (e.g., 3.14) are handled heuristically to prevent false splits, but
 * unusual or domain-specific abbreviations may miscount sentences.
 *
 * @param {string} text - Input string to analyze.
 * @returns {number} The total number of sentences.
 */
export function getSentenceCount(text) {
  if (typeof text !== 'string' || !text) return 0;
  const trimmed = text.trim();
  if (!trimmed) return 0;

  const sanitized = trimmed
    .replace(/\b(Mr|Mrs|Ms|Dr|Prof|Sr|Jr|vs|etc|e\.g|i\.e)\./gi, '$1_DOT_')
    .replace(/(\d)\.(\d)/g, '$1_DOT_$2');

  const sentences = sanitized
    .split(/[.!?]+(?:\s+|$)/)
    .map((s) => s.trim())
    .filter(Boolean);

  return sentences.length;
}

/**
 * Computes paragraph count in a given text by splitting on blank lines.
 *
 * @param {string} text - Input string to analyze.
 * @returns {number} The total number of paragraphs.
 */
export function getParagraphCount(text) {
  if (typeof text !== 'string' || !text) return 0;
  const trimmed = text.trim();
  if (!trimmed) return 0;

  return trimmed
    .split(/(?:\r?\n\s*){2,}/)
    .filter((paragraph) => paragraph.trim().length > 0).length;
}

/**
 * Calculates estimated reading time in minutes based on words-per-minute.
 *
 * @param {number} wordCount - Total number of words.
 * @param {number} [wpm=200] - Configurable words per minute constant.
 * @returns {{ minutes: number, text: string }} Object containing reading time.
 */
export function getReadingTime(wordCount, wpm = 200) {
  const safeWpm = typeof wpm === 'number' && wpm > 0 ? wpm : 200;
  if (typeof wordCount !== 'number' || wordCount <= 0) {
    return { minutes: 0, text: '0 min read' };
  }

  const minutes = Math.ceil(wordCount / safeWpm);
  return {
    minutes,
    text: `${minutes} min read`,
  };
}

/**
 * Computes the UTF-8 byte size of an input string using TextEncoder.
 *
 * @param {string} text - Input string to analyze.
 * @returns {number} UTF-8 encoded byte length.
 */
export function getByteSize(text) {
  if (typeof text !== 'string' || !text) return 0;
  return new TextEncoder().encode(text).length;
}

/**
 * Computes all text statistics for a given input string.
 *
 * @param {string} text - Input string to analyze.
 * @param {{ wpm?: number }} [options={}] - Configuration options.
 * @returns {Object} Full text statistics metrics.
 */
export function computeTextStats(text = '', options = {}) {
  const input = typeof text === 'string' ? text : '';
  const { wpm = 200 } = options;

  const words = getWordCount(input);
  const characters = getCharacterCount(input, true);
  const charactersNoSpaces = getCharacterCount(input, false);
  const sentences = getSentenceCount(input);
  const paragraphs = getParagraphCount(input);
  const readingTime = getReadingTime(words, wpm);
  const byteSize = getByteSize(input);

  return {
    words,
    characters,
    charactersNoSpaces,
    sentences,
    paragraphs,
    readingTimeMinutes: readingTime.minutes,
    readingTimeText: readingTime.text,
    byteSize,
  };
}

/**
 * Formats a plain-text summary of text statistics suitable for copying to clipboard.
 *
 * @param {Object} stats - Text statistics object from computeTextStats.
 * @returns {string} Plain-text summary string.
 */
export function formatStatsSummary(stats) {
  if (!stats) return '';
  const parts = [
    `Words: ${stats.words}`,
    `Characters (with spaces): ${stats.characters}`,
    `Characters (no spaces): ${stats.charactersNoSpaces}`,
    `Sentences: ${stats.sentences}`,
    `Paragraphs: ${stats.paragraphs}`,
    `Reading time: ${stats.readingTimeText}`,
    `Byte size: ${stats.byteSize} B`,
  ];
  return parts.join(', ');
}
