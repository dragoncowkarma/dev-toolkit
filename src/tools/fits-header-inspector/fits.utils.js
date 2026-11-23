const BLOCK = 2880;
const CARD = 80;

function parseValue(text) {
  const input = text.trimStart();
  if (input.startsWith("'")) {
    let value = '';
    for (let i = 1; i < input.length; i += 1) {
      if (input[i] === "'") {
        if (input[i + 1] === "'") {
          value += "'";
          i += 1;
        } else {
          const rest = input.slice(i + 1).trim();
          const comment = rest.startsWith('/') ? rest.slice(1).trim() : '';
          return { value: value.trimEnd(), comment };
        }
      } else value += input[i];
    }
    throw new Error('Unterminated FITS string value.');
  }
  const slash = input.indexOf('/');
  const raw = (slash < 0 ? input : input.slice(0, slash)).trim();
  const comment = slash < 0 ? '' : input.slice(slash + 1).trim();
  let value = raw;
  if (raw === 'T' || raw === 'F') value = raw === 'T';
  else if (/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[EeDd][+-]?\d+)?$/.test(raw)) {
    value = Number(raw.replace(/[Dd]/, 'E'));
  }
  return { value, comment };
}

function parseCard(text) {
  const keyword = text.slice(0, 8).trim();
  if (keyword === 'COMMENT' || keyword === 'HISTORY' || !keyword) {
    return { keyword, value: '', comment: text.slice(8).trim() };
  }
  if (keyword === 'CONTINUE') return { keyword, ...parseValue(text.slice(8)) };
  if (text.slice(8, 10) === '= ') return { keyword, ...parseValue(text.slice(10)) };
  return { keyword, value: '', comment: text.slice(8).trim() };
}

function integer(value, name, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) throw new Error(`Invalid ${name}.`);
  return value;
}

function dataSize(values) {
  const bitpix = values.BITPIX;
  if (![8, 16, 32, 64, -32, -64].includes(bitpix)) throw new Error('Invalid BITPIX.');
  const naxis = integer(values.NAXIS, 'NAXIS');
  if (naxis > 999) throw new Error('Invalid NAXIS.');
  let elements = naxis === 0 ? 0 : 1;
  for (let i = 1; i <= naxis; i += 1) {
    elements *= integer(values[`NAXIS${i}`], `NAXIS${i}`);
    if (!Number.isSafeInteger(elements)) throw new Error('FITS data size is too large.');
  }
  const pcount = integer(values.PCOUNT ?? 0, 'PCOUNT');
  const gcount = integer(values.GCOUNT ?? 1, 'GCOUNT', 1);
  const size = (elements + pcount) * gcount * Math.abs(bitpix) / 8;
  if (!Number.isSafeInteger(size)) throw new Error('FITS data size is too large.');
  return size;
}

/** Parse all FITS HDUs from an ArrayBuffer or Uint8Array, rejecting truncated input. */
export function parseFits(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (!bytes.length || bytes.length % BLOCK !== 0) throw new Error('Invalid FITS block size.');
  const hdus = [];
  let offset = 0;
  while (offset < bytes.length) {
    const start = offset;
    const cards = [];
    const values = {};
    let ended = false;
    while (!ended) {
      if (offset + BLOCK > bytes.length) throw new Error('Missing END card or truncated header.');
      for (let pos = offset; pos < offset + BLOCK; pos += CARD) {
        const part = bytes.subarray(pos, pos + CARD);
        if (part.some((byte) => byte < 32 || byte > 126)) {
          throw new Error('Non-ASCII FITS header card.');
        }
        const text = String.fromCharCode(...part);
        if (ended) {
          if (text.trim()) throw new Error('Invalid header padding after END.');
          continue;
        }
        const card = parseCard(text);
        cards.push(card);
        if (card.keyword === 'END') ended = true;
        else if (card.keyword && card.keyword !== 'CONTINUE' && !(card.keyword in values)) {
          values[card.keyword] = card.value;
        }
      }
      offset += BLOCK;
    }
    if (hdus.length === 0) {
      if (cards[0]?.keyword !== 'SIMPLE' || values.SIMPLE !== true) {
        throw new Error('Invalid FITS signature: expected SIMPLE = T.');
      }
    } else if (cards[0]?.keyword !== 'XTENSION' || typeof values.XTENSION !== 'string') {
      throw new Error('Invalid FITS extension signature.');
    }
    const size = dataSize(values);
    const paddedSize = Math.ceil(size / BLOCK) * BLOCK;
    if (!Number.isSafeInteger(paddedSize) || paddedSize > bytes.length - offset) {
      throw new Error('Truncated FITS data block.');
    }
    hdus.push({ cards, values, headerOffset: start, dataOffset: offset, dataSize: size });
    offset += paddedSize;
  }
  return hdus;
}
