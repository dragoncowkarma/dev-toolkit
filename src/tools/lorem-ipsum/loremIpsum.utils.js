export const LOREM_UNITS = Object.freeze({
  PARAGRAPHS: 'paragraphs',
  SENTENCES: 'sentences',
  WORDS: 'words',
});

export const MIN_LOREM_COUNT = 1;
export const MAX_LOREM_COUNT = 100;
export const DEFAULT_LOREM_COUNT = 3;

const STANDARD_OPENING = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.';
const WORDS = [
  'adipiscing', 'aliquam', 'amet', 'ante', 'arcu', 'auctor', 'commodo', 'congue',
  'consectetur', 'consequat', 'curabitur', 'cursus', 'diam', 'dictum', 'dignissim',
  'dolor', 'dolore', 'dui', 'efficitur', 'egestas', 'elementum', 'enim', 'erat',
  'etiam', 'euismod', 'facilisi', 'felis', 'finibus', 'fusce', 'gravida', 'iaculis',
  'imperdiet', 'inceptos', 'integer', 'interdum', 'ipsum', 'justo', 'lacus', 'libero',
  'ligula', 'lorem', 'maecenas', 'magna', 'malesuada', 'massa', 'mattis', 'maximus',
  'metus', 'mi', 'molestie', 'morbi', 'nam', 'nec', 'neque', 'nibh', 'nisl', 'nunc',
  'odio', 'ornare', 'pellentesque', 'pharetra', 'porta', 'posuere', 'praesent', 'purus',
  'quam', 'quis', 'rhoncus', 'risus', 'sagittis', 'sapien', 'sed', 'sem', 'semper',
  'sodales', 'sollicitudin', 'suscipit', 'tempus', 'tellus', 'titor', 'tristique',
  'turpis', 'ullamcorper', 'ultrices', 'urna', 'ut', 'varius', 'vel', 'venenatis',
  'vestibulum', 'vitae', 'vivamus', 'volutpat', 'vulputate',
];

function validateCount(count) {
  if (!Number.isInteger(count) || count < MIN_LOREM_COUNT || count > MAX_LOREM_COUNT) {
    throw new RangeError(
      `Lorem Ipsum count must be an integer from ${MIN_LOREM_COUNT} to ${MAX_LOREM_COUNT}.`
    );
  }
}

function capitalize(value) {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function pickWord(random) {
  return WORDS[Math.floor(random() * WORDS.length)];
}

function createSentence(random, startsWithStandardOpening) {
  if (startsWithStandardOpening) return STANDARD_OPENING;

  const length = 8 + Math.floor(random() * 7);
  const sentenceWords = Array.from({ length }, () => pickWord(random));
  return `${capitalize(sentenceWords.join(' '))}.`;
}

function wrapHtml(blocks, includeHtml) {
  return includeHtml ? blocks.map((block) => `<p>${block}</p>`).join('\n') : blocks.join('\n\n');
}

/**
 * Generates Lorem Ipsum output for the selected unit and options.
 *
 * @param {object} [options] Generation options.
 * @param {'paragraphs' | 'sentences' | 'words'} [options.unit='paragraphs'] Output unit.
 * @param {number} [options.count=3] Number of selected units to generate.
 * @param {boolean} [options.startWithLorem=true] Starts the result with standard Lorem Ipsum.
 * @param {boolean} [options.includeHtml=false] Wraps output blocks in paragraph tags.
 * @param {() => number} [options.random=Math.random] Random number source for reproducible tests.
 * @returns {string} Generated placeholder text.
 */
export function generateLoremIpsum({
  unit = LOREM_UNITS.PARAGRAPHS,
  count = DEFAULT_LOREM_COUNT,
  startWithLorem = true,
  includeHtml = false,
  random = Math.random,
} = {}) {
  validateCount(count);
  if (!Object.values(LOREM_UNITS).includes(unit)) {
    throw new RangeError(`Unsupported Lorem Ipsum unit: ${unit}`);
  }

  if (unit === LOREM_UNITS.WORDS) {
    const openingWords = STANDARD_OPENING.replaceAll(/[,.]/g, '').split(' ');
    const generatedWords = Array.from({ length: count }, (_, index) => (
      startWithLorem && index < openingWords.length ? openingWords[index] : pickWord(random)
    ));
    return wrapHtml([generatedWords.join(' ')], includeHtml);
  }

  if (unit === LOREM_UNITS.SENTENCES) {
    const sentences = Array.from({ length: count }, (_, index) => (
      createSentence(random, startWithLorem && index === 0)
    ));
    return wrapHtml(sentences, includeHtml);
  }

  const paragraphs = Array.from({ length: count }, (_, paragraphIndex) => {
    const sentenceCount = 3 + Math.floor(random() * 3);
    return Array.from({ length: sentenceCount }, (_, sentenceIndex) => (
      createSentence(random, startWithLorem && paragraphIndex === 0 && sentenceIndex === 0)
    )).join(' ');
  });
  return wrapHtml(paragraphs, includeHtml);
}

/**
 * Counts visible words and all output characters in generated Lorem Ipsum text.
 *
 * @param {string} text Generated text, optionally containing paragraph markup.
 * @returns {{wordCount: number, characterCount: number}} Output statistics.
 */
export function getLoremIpsumStatistics(text) {
  const output = typeof text === 'string' ? text : '';
  const visibleText = output.replaceAll(/<\/?p>/g, ' ').trim();
  const wordCount = visibleText ? visibleText.split(/\s+/).length : 0;
  return { wordCount, characterCount: output.length };
}
