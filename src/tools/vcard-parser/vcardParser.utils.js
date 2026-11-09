const SUPPORTED_VERSIONS = new Set(['2.1', '3.0', '4.0']);

/**
 * Joins RFC 6350 folded content lines into their logical content lines.
 * @param {string} text
 * @returns {string[]}
 */
export function unfoldVCardLines(text) {
  if (typeof text !== 'string') {
    throw new TypeError('vCard input must be a string.');
  }

  return text.replace(/\r\n?/g, '\n').split('\n').reduce((lines, line) => {
    if (/^[ \t]/.test(line) && lines.length > 0) {
      lines[lines.length - 1] += line.slice(1);
    } else {
      lines.push(line);
    }
    return lines;
  }, []);
}

function findUnescapedDelimiter(value, delimiter) {
  let escaped = false;
  for (let index = 0; index < value.length; index += 1) {
    if (!escaped && value[index] === delimiter) return index;
    escaped = !escaped && value[index] === '\\';
    if (value[index] !== '\\') escaped = false;
  }
  return -1;
}

function splitEscaped(value, delimiter) {
  const values = [];
  let current = '';
  let escaped = false;
  for (const character of value) {
    if (!escaped && character === delimiter) {
      values.push(current);
      current = '';
    } else {
      current += character;
    }
    escaped = !escaped && character === '\\';
    if (character !== '\\') escaped = false;
  }
  values.push(current);
  return values;
}

function unescapeValue(value) {
  return value.replace(/\\([nN,;\\])/g, (_match, character) => {
    return character.toLowerCase() === 'n' ? '\n' : character;
  });
}

function parseProperty(line) {
  const separator = findUnescapedDelimiter(line, ':');
  if (separator < 1) return null;

  const left = line.slice(0, separator);
  const parts = left.split(';');
  const namedPart = parts.shift();
  const name = namedPart.split('.').at(-1).toUpperCase();
  if (!/^[A-Z0-9-]+$/.test(name)) return null;

  const params = {};
  parts.forEach((part) => {
    const [rawKey, ...rawValue] = part.split('=');
    const key = rawValue.length > 0 ? rawKey.toUpperCase() : 'TYPE';
    const value = rawValue.length > 0 ? rawValue.join('=') : rawKey;
    const values = splitEscaped(value.replace(/^"|"$/g, ''), ',').map(unescapeValue);
    params[key] = [...(params[key] || []), ...values];
  });

  const rawValue = line.slice(separator + 1);
  return { name, params, rawValue, value: unescapeValue(rawValue) };
}

function typeLabels(params) {
  return (params.TYPE || []).filter(Boolean);
}

function createCard(lines, errors = []) {
  const card = {
    rawLines: lines,
    errors: [...errors],
    warnings: [],
    properties: {},
    version: '',
    fullName: '',
    name: null,
    organization: [],
    title: '',
    phones: [],
    emails: [],
    addresses: [],
    urls: [],
    birthday: '',
    notes: [],
    photos: [],
  };

  if (lines.length === 0 || !/^BEGIN:VCARD$/i.test(lines[0])) {
    card.errors.push('Card must start with BEGIN:VCARD.');
  }
  if (lines.length === 0 || !/^END:VCARD$/i.test(lines.at(-1))) {
    card.errors.push('Card must end with END:VCARD.');
  }

  lines.slice(1, -1).forEach((line, index) => {
    if (!line.trim()) return;
    const property = parseProperty(line);
    if (!property) {
      card.errors.push(`Malformed field on line ${index + 2}: ${line}`);
      return;
    }
    const { name, params, rawValue, value } = property;
    card.properties[name] = [...(card.properties[name] || []), property];
    if (name === 'VERSION') card.version = value;
    if (name === 'FN' && !card.fullName) card.fullName = value;
    if (name === 'N' && !card.name) {
      const fields = splitEscaped(rawValue, ';').map(unescapeValue);
      const [family = '', given = '', additional = '', prefix = '', suffix = ''] = fields;
      card.name = { family, given, additional, prefix, suffix };
    }
    if (name === 'ORG') {
      card.organization.push(...splitEscaped(rawValue, ';').map(unescapeValue));
    }
    if (name === 'TITLE' && !card.title) card.title = value;
    if (name === 'TEL') card.phones.push({ value, types: typeLabels(params) });
    if (name === 'EMAIL') card.emails.push({ value, types: typeLabels(params) });
    if (name === 'ADR') {
      const fields = splitEscaped(rawValue, ';').map(unescapeValue);
      const [poBox = '', extended = '', street = '', locality = ''] = fields;
      const [region = '', postalCode = '', country = ''] = fields.slice(4);
      card.addresses.push({
        poBox, extended, street, locality, region, postalCode, country, types: typeLabels(params),
      });
    }
    if (name === 'URL') card.urls.push(value);
    if (name === 'BDAY' && !card.birthday) card.birthday = value;
    if (name === 'NOTE') card.notes.push(value);
    if (name === 'PHOTO') {
      const external = /^https?:\/\//i.test(value);
      card.photos.push({ value, external });
      if (external) card.warnings.push('PHOTO contains an external reference and was not loaded.');
    }
  });

  if (!card.version) {
    card.errors.push('Missing required VERSION property.');
  } else if (!SUPPORTED_VERSIONS.has(card.version)) {
    card.errors.push(`Unsupported or malformed VERSION: ${card.version}.`);
  }
  if (!card.fullName && !(card.version === '2.1' && card.name)) {
    const missingNameError = card.version === '2.1'
      ? 'Missing required FN or N property.'
      : 'Missing required FN property.';
    card.errors.push(missingNameError);
  }
  return card;
}

/**
 * Parses a VCF document into independently validated vCard records.
 * @param {string} text
 * @returns {Array<object>}
 */
export function parseVCards(text) {
  const lines = unfoldVCardLines(text);
  const cards = [];
  let current = null;
  let outside = [];

  function addOutsideError() {
    if (outside.some((line) => line.trim())) {
      cards.push(createCard(outside, ['Content appears outside a vCard record.']));
    }
    outside = [];
  }

  lines.forEach((line) => {
    if (/^BEGIN:VCARD$/i.test(line)) {
      addOutsideError();
      if (current) cards.push(createCard(current, ['Missing END:VCARD before the next card.']));
      current = [line];
    } else if (/^END:VCARD$/i.test(line)) {
      if (!current) {
        outside.push(line);
      } else {
        current.push(line);
        cards.push(createCard(current));
        current = null;
      }
    } else if (current) {
      current.push(line);
    } else {
      outside.push(line);
    }
  });

  if (current) cards.push(createCard(current, ['Missing END:VCARD.']));
  addOutsideError();
  if (cards.length === 0) return [createCard([], ['No vCard record found.'])];
  return cards;
}
