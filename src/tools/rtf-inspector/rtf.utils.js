const FONT_FAMILIES = {
  fnil: 'Unknown',
  froman: 'Roman',
  fswiss: 'Swiss',
  fmodern: 'Modern',
  fscript: 'Script',
  fdecor: 'Decorative',
  ftech: 'Technical',
  fbidi: 'Bidi',
};

/**
 * Parses the header metadata from an RTF document.
 *
 * @param {string} source - RTF source text read from a local file.
 * @returns {{version: number, charset: string, defaultFont: number|null, fonts: object[],
 *   colors: object[], maxDepth: number}}
 * @throws {Error} When the source is not a complete RTF document.
 */
export function parseRtfHeader(source) {
  if (typeof source !== 'string') {
    throw new TypeError('RTF input must be text.');
  }

  const groups = collectGroups(source);
  const signature = /^\s*\{\s*\\rtf1(?:[^0-9]|$)/.exec(source);
  if (!signature) {
    throw new Error('Missing RTF signature: expected \\rtf1 at the start of the document.');
  }

  const headerEnd = source.indexOf('{', signature[0].length);
  const header = source.slice(0, headerEnd === -1 ? source.length : headerEnd);
  const charset = /\\(ansi|mac|pc|pca)(?:\s|\\|\{|}|$)/.exec(header)?.[1] ?? 'ansi';
  const defaultFontMatch = /\\deff(-?\d+)(?:\s|\\|\{|}|$)/.exec(header);
  const fontGroup = groups.find((group) => group.startsWithControl('fonttbl'));
  const colorGroup = groups.find((group) => group.startsWithControl('colortbl'));

  return {
    version: 1,
    charset,
    defaultFont: defaultFontMatch ? Number(defaultFontMatch[1]) : null,
    fonts: fontGroup ? parseFontTable(source, fontGroup) : [],
    colors: colorGroup ? parseColorTable(source, colorGroup) : [],
    maxDepth: Math.max(...groups.map((group) => group.depth)),
  };
}

function collectGroups(source) {
  const groups = [];
  const stack = [];
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === '\\') {
      index = skipControl(source, index);
      continue;
    }
    if (source[index] === '{') {
      stack.push({ start: index, depth: stack.length + 1 });
    } else if (source[index] === '}') {
      const group = stack.pop();
      if (!group) throw new Error('Malformed RTF: found a closing brace without an opening brace.');
      groups.push(createGroup(source, group, index));
    }
  }
  if (stack.length > 0) {
    throw new Error('Malformed RTF: document ends before all groups are closed.');
  }
  if (groups.length === 0) throw new Error('Malformed RTF: no header group was found.');
  return groups;
}

function createGroup(source, group, end) {
  return {
    ...group,
    end,
    startsWithControl(control) {
      const content = source.slice(group.start + 1, end);
      return new RegExp(`^\\s*\\\\${control}(?:[^A-Za-z]|$)`).test(content);
    },
  };
}

function skipControl(source, slashIndex) {
  let index = slashIndex + 1;
  if (index >= source.length) return index;
  if (source[index] === "'") return index + 2;
  if (!/[A-Za-z]/.test(source[index])) return index;
  while (/[A-Za-z]/.test(source[index] ?? '')) index += 1;
  if (source[index] === '-' || /\d/.test(source[index] ?? '')) {
    index += 1;
    while (/\d/.test(source[index] ?? '')) index += 1;
  }
  return source[index] === ' ' ? index : index - 1;
}

function parseFontTable(source, fontGroup) {
  return collectGroups(source)
    .filter((group) => group.depth === fontGroup.depth + 1)
    .filter((group) => /^\s*\\f-?\d+/.test(source.slice(group.start + 1, group.end)))
    .map((group) => parseFontEntry(source.slice(group.start + 1, group.end)));
}

function parseFontEntry(content) {
  const index = Number(/\\f(-?\d+)/.exec(content)?.[1]);
  const familyWord = /\\(fnil|froman|fswiss|fmodern|fscript|fdecor|ftech|fbidi)\b/
    .exec(content)?.[1];
  const name = decodeRtfText(content).replace(/;.*$/s, '').trim();
  return { index, family: FONT_FAMILIES[familyWord] ?? 'Unknown', name };
}

function parseColorTable(source, colorGroup) {
  const content = source.slice(colorGroup.start + 1, colorGroup.end).replace(/^\s*\\colortbl/, '');
  return content.split(';').reduce((colors, entry, index) => {
    const red = /\\red(\d+)/.exec(entry)?.[1];
    const green = /\\green(\d+)/.exec(entry)?.[1];
    const blue = /\\blue(\d+)/.exec(entry)?.[1];
    if (red !== undefined || green !== undefined || blue !== undefined) {
      colors.push({
        index,
        red: Number(red ?? 0),
        green: Number(green ?? 0),
        blue: Number(blue ?? 0),
      });
    }
    return colors;
  }, []);
}

function decodeRtfText(content) {
  let decoded = '';
  for (let index = 0; index < content.length; index += 1) {
    if (content[index] === '{' || content[index] === '}') continue;
    if (content[index] !== '\\') {
      decoded += content[index];
      continue;
    }
    if (content[index + 1] === "'") {
      const value = Number.parseInt(content.slice(index + 2, index + 4), 16);
      decoded += new TextDecoder('windows-1252').decode(Uint8Array.of(value));
      index += 3;
      continue;
    }
    const unicode = /^\\u(-?\d+)/.exec(content.slice(index));
    if (unicode) {
      const value = Number(unicode[1]);
      decoded += String.fromCharCode(value < 0 ? value + 65536 : value);
      index += unicode[0].length - 1;
      index = skipUnicodeFallback(content, index);
      continue;
    }
    index = skipControl(content, index);
  }
  return decoded;
}

function skipUnicodeFallback(content, index) {
  const next = index + 1;
  if (content[next] === '\\' && content[next + 1] === "'") return next + 3;
  if (content[next] === '\\') return skipControl(content, next);
  return next;
}
