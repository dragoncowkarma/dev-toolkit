export const ENTITY_MODES = {
  NAMED: 'named',
  DECIMAL: 'decimal',
  HEX: 'hex',
};

export const ENTITY_SCOPES = {
  RESERVED: 'reserved',
  ALL: 'all',
};

const RESERVED_ENTITIES = {
  '<': '&lt;',
  '>': '&gt;',
  '&': '&amp;',
  '"': '&quot;',
  "'": '&#39;',
};

const NAMED_ENTITIES = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  quot: '"',
};

function numericEntity(character, mode) {
  const codePoint = character.codePointAt(0);
  return mode === ENTITY_MODES.HEX
    ? `&#x${codePoint.toString(16)};`
    : `&#${codePoint};`;
}

function decodeNumericEntity(entity) {
  const isHex = entity[2].toLowerCase() === 'x';
  const digits = entity.slice(isHex ? 3 : 2, -1);
  const codePoint = Number.parseInt(digits, isHex ? 16 : 10);

  if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff) {
    return entity;
  }

  try {
    return String.fromCodePoint(codePoint);
  } catch {
    return entity;
  }
}

/**
 * Encodes text as HTML entities.
 *
 * In named mode, the five HTML-reserved characters use their named entities.
 * Characters without a named equivalent use a decimal numeric entity when the
 * all-character scope is selected.
 *
 * @param {string} text Plain text to encode.
 * @param {'named'|'decimal'|'hex'} mode Entity representation.
 * @param {'reserved'|'all'} scope Characters to convert.
 * @returns {string} HTML entity encoded text.
 */
export function encodeHtmlEntities(
  text,
  mode = ENTITY_MODES.NAMED,
  scope = ENTITY_SCOPES.RESERVED
) {
  if (typeof text !== 'string') {
    throw new TypeError('Input must be a string.');
  }
  if (!Object.values(ENTITY_MODES).includes(mode)) {
    throw new TypeError('Entity mode must be named, decimal, or hex.');
  }
  if (!Object.values(ENTITY_SCOPES).includes(scope)) {
    throw new TypeError('Entity scope must be reserved or all.');
  }

  return Array.from(text)
    .map((character) => {
      if (scope === ENTITY_SCOPES.RESERVED && !Object.hasOwn(RESERVED_ENTITIES, character)) {
        return character;
      }
      if (mode === ENTITY_MODES.NAMED && Object.hasOwn(RESERVED_ENTITIES, character)) {
        return RESERVED_ENTITIES[character];
      }
      return numericEntity(character, mode);
    })
    .join('');
}

/**
 * Decodes named and decimal or hexadecimal numeric HTML entities.
 * Unknown or invalid entities are kept unchanged to avoid destructive edits.
 *
 * @param {string} text Entity encoded text to decode.
 * @returns {string} Decoded text.
 */
export function decodeHtmlEntities(text) {
  if (typeof text !== 'string') {
    throw new TypeError('Input must be a string.');
  }

  return text.replace(/&(?:#(?:x[\da-f]+|\d+)|[a-z]+);/gi, (entity) => {
    if (entity[1] === '#') {
      return decodeNumericEntity(entity);
    }
    const name = entity.slice(1, -1).toLowerCase();
    return NAMED_ENTITIES[name] ?? entity;
  });
}
