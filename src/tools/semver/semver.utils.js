/**
 * Utility functions for semantic version parsing, comparison, release bumping,
 * and range satisfaction.
 *
 * Implements SemVer 2.0.0 specification (https://semver.org/).
 */

/**
 * Parses a semantic version string into its constituent parts.
 *
 * @param {string} version - Version string to parse (supports optional leading 'v' or 'V').
 * @returns {{
 *   major: number,
 *   minor: number,
 *   patch: number,
 *   prerelease: (string|number)[],
 *   build: string[],
 *   raw: string
 * }|null} Parsed version object, or null if invalid.
 */
export function parseSemver(version) {
  if (typeof version !== 'string') return null;
  const trimmed = version.trim();
  if (!trimmed) return null;

  let vStr = trimmed;
  if (vStr.startsWith('v') || vStr.startsWith('V')) {
    vStr = vStr.slice(1);
  }

  const regex = new RegExp(
    '^([0-9]+)\\.([0-9]+)\\.([0-9]+)' +
      '(?:-([0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*))?' +
      '(?:\\+([0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*))?$'
  );
  const match = vStr.match(regex);
  if (!match) return null;

  const [, majorStr, minorStr, patchStr, prereleaseStr, buildStr] = match;

  if (
    (majorStr.length > 1 && majorStr.startsWith('0')) ||
    (minorStr.length > 1 && minorStr.startsWith('0')) ||
    (patchStr.length > 1 && patchStr.startsWith('0'))
  ) {
    return null;
  }

  const major = parseInt(majorStr, 10);
  const minor = parseInt(minorStr, 10);
  const patch = parseInt(patchStr, 10);

  const prerelease = [];
  if (prereleaseStr !== undefined) {
    const parts = prereleaseStr.split('.');
    for (const part of parts) {
      if (part === '') return null;
      if (/^[0-9]+$/.test(part)) {
        if (part.length > 1 && part.startsWith('0')) {
          return null;
        }
        prerelease.push(parseInt(part, 10));
      } else {
        prerelease.push(part);
      }
    }
  }

  const build = [];
  if (buildStr !== undefined) {
    const parts = buildStr.split('.');
    for (const part of parts) {
      if (part === '') return null;
      build.push(part);
    }
  }

  return {
    major,
    minor,
    patch,
    prerelease,
    build,
    raw: version,
  };
}

/**
 * Compares two semantic versions according to SemVer 2.0.0 precedence rules.
 *
 * @param {string|object} a - First version string or parsed version object.
 * @param {string|object} b - Second version string or parsed version object.
 * @returns {-1|0|1|null} -1 if a < b, 0 if equal, 1 if a > b, or null if invalid.
 */
export function compareSemver(a, b) {
  const pa = typeof a === 'object' && a !== null && 'major' in a ? a : parseSemver(a);
  const pb = typeof b === 'object' && b !== null && 'major' in b ? b : parseSemver(b);

  if (!pa || !pb) return null;

  if (pa.major !== pb.major) return pa.major > pb.major ? 1 : -1;
  if (pa.minor !== pb.minor) return pa.minor > pb.minor ? 1 : -1;
  if (pa.patch !== pb.patch) return pa.patch > pb.patch ? 1 : -1;

  if (pa.prerelease.length === 0 && pb.prerelease.length === 0) return 0;
  if (pa.prerelease.length === 0 && pb.prerelease.length > 0) return 1;
  if (pa.prerelease.length > 0 && pb.prerelease.length === 0) return -1;

  const minLen = Math.min(pa.prerelease.length, pb.prerelease.length);
  for (let i = 0; i < minLen; i += 1) {
    const idA = pa.prerelease[i];
    const idB = pb.prerelease[i];

    if (idA !== idB) {
      const typeA = typeof idA;
      const typeB = typeof idB;

      if (typeA === 'number' && typeB === 'number') {
        return idA > idB ? 1 : -1;
      }
      if (typeA === 'number' && typeB === 'string') {
        return -1;
      }
      if (typeA === 'string' && typeB === 'number') {
        return 1;
      }
      return idA > idB ? 1 : -1;
    }
  }

  if (pa.prerelease.length !== pb.prerelease.length) {
    return pa.prerelease.length > pb.prerelease.length ? 1 : -1;
  }

  return 0;
}

/**
 * Returns the most significant level at which two version strings differ.
 *
 * @param {string|object} a - First version string or parsed version object.
 * @param {string|object} b - Second version string or parsed version object.
 * @returns {'major'|'minor'|'patch'|'prerelease'|'build'|null} Release level diff or null.
 */
export function diffSemver(a, b) {
  const pa = typeof a === 'object' && a !== null && 'major' in a ? a : parseSemver(a);
  const pb = typeof b === 'object' && b !== null && 'major' in b ? b : parseSemver(b);

  if (!pa || !pb) return null;

  if (pa.major !== pb.major) return 'major';
  if (pa.minor !== pb.minor) return 'minor';
  if (pa.patch !== pb.patch) return 'patch';

  const preDiff =
    pa.prerelease.length !== pb.prerelease.length ||
    pa.prerelease.some((val, idx) => val !== pb.prerelease[idx]);
  if (preDiff) return 'prerelease';

  const buildDiff =
    pa.build.length !== pb.build.length ||
    pa.build.some((val, idx) => val !== pb.build[idx]);
  if (buildDiff) return 'build';

  return null;
}

/**
 * Bumps a version string according to the requested release type.
 *
 * @param {string} version - Base version string.
 * @param {'major'|'minor'|'patch'|'prerelease'} releaseType - Release bump type.
 * @returns {string|null} Bumped version string, or null if invalid inputs.
 */
export function bumpSemver(version, releaseType) {
  const parsed = parseSemver(version);
  if (!parsed) return null;

  const { major, minor, patch, prerelease } = parsed;

  switch (releaseType) {
    case 'major':
      return `${major + 1}.0.0`;

    case 'minor':
      return `${major}.${minor + 1}.0`;

    case 'patch':
      if (prerelease.length > 0) {
        return `${major}.${minor}.${patch}`;
      }
      return `${major}.${minor}.${patch + 1}`;

    case 'prerelease':
      if (prerelease.length > 0) {
        const nextPre = [...prerelease];
        const lastIdx = nextPre.length - 1;
        if (typeof nextPre[lastIdx] === 'number') {
          nextPre[lastIdx] += 1;
        } else {
          nextPre.push(0);
        }
        return `${major}.${minor}.${patch}-${nextPre.join('.')}`;
      }
      return `${major}.${minor}.${patch + 1}-0`;

    default:
      return null;
  }
}

/**
 * Checks if a string or part represents a wildcard.
 *
 * @param {string} str - String identifier.
 * @returns {boolean} True if wildcard or undefined.
 */
function isWildcard(str) {
  return str === '*' || str === 'x' || str === 'X' || str === undefined;
}

/**
 * Parses a primitive range comparator token (e.g. '>=1.2.0', '<2.0.0-0').
 *
 * @param {string} op - Comparator operator ('=', '>=', '>', '<=', '<').
 * @param {string} verStr - Version string portion.
 * @returns {Array<{ operator: string, semver: object }>|null} Array of comparators, or null.
 */
function parsePrimitiveRange(op, verStr) {
  if (isWildcard(verStr)) {
    if (op === '<') {
      const sv = parseSemver('0.0.0-0');
      return sv ? [{ operator: '<', semver: sv }] : null;
    }
    const sv = parseSemver('0.0.0');
    return sv ? [{ operator: '>=', semver: sv }] : null;
  }

  const mainVer = verStr.split(/[-+]/)[0];
  const parts = mainVer.split('.');

  if (parts.length > 3) return null;

  if (parts.length === 1) {
    const mStr = parts[0];
    if (isWildcard(mStr)) {
      const sv = parseSemver('0.0.0');
      return sv ? [{ operator: '>=', semver: sv }] : null;
    }
    const mVal = parseInt(mStr, 10);
    if (Number.isNaN(mVal) || mVal < 0 || mStr !== String(mVal)) return null;

    if (op === '=') {
      const lower = parseSemver(`${mVal}.0.0`);
      const upper = parseSemver(`${mVal + 1}.0.0-0`);
      if (!lower || !upper) return null;
      return [{ operator: '>=', semver: lower }, { operator: '<', semver: upper }];
    }
    if (op === '>=') {
      const lower = parseSemver(`${mVal}.0.0`);
      return lower ? [{ operator: '>=', semver: lower }] : null;
    }
    if (op === '>') {
      const lower = parseSemver(`${mVal + 1}.0.0`);
      return lower ? [{ operator: '>=', semver: lower }] : null;
    }
    if (op === '<=') {
      const upper = parseSemver(`${mVal + 1}.0.0-0`);
      return upper ? [{ operator: '<', semver: upper }] : null;
    }
    if (op === '<') {
      const upper = parseSemver(`${mVal}.0.0-0`);
      return upper ? [{ operator: '<', semver: upper }] : null;
    }
  }

  if (parts.length === 2) {
    const [mStr, nStr] = parts;
    const mVal = parseInt(mStr, 10);
    if (Number.isNaN(mVal) || mVal < 0 || mStr !== String(mVal)) return null;

    if (isWildcard(nStr)) {
      return parsePrimitiveRange(op, `${mVal}`);
    }

    const nVal = parseInt(nStr, 10);
    if (Number.isNaN(nVal) || nVal < 0 || nStr !== String(nVal)) return null;

    if (op === '=') {
      const lower = parseSemver(`${mVal}.${nVal}.0`);
      const upper = parseSemver(`${mVal}.${nVal + 1}.0-0`);
      if (!lower || !upper) return null;
      return [{ operator: '>=', semver: lower }, { operator: '<', semver: upper }];
    }
    if (op === '>=') {
      const lower = parseSemver(`${mVal}.${nVal}.0`);
      return lower ? [{ operator: '>=', semver: lower }] : null;
    }
    if (op === '>') {
      const lower = parseSemver(`${mVal}.${nVal + 1}.0`);
      return lower ? [{ operator: '>=', semver: lower }] : null;
    }
    if (op === '<=') {
      const upper = parseSemver(`${mVal}.${nVal + 1}.0-0`);
      return upper ? [{ operator: '<', semver: upper }] : null;
    }
    if (op === '<') {
      const upper = parseSemver(`${mVal}.${nVal}.0-0`);
      return upper ? [{ operator: '<', semver: upper }] : null;
    }
  }

  if (parts.length === 3) {
    const [mStr, nStr, pStr] = parts;
    const mVal = parseInt(mStr, 10);
    const nVal = parseInt(nStr, 10);
    if (
      Number.isNaN(mVal) ||
      mVal < 0 ||
      mStr !== String(mVal) ||
      Number.isNaN(nVal) ||
      nVal < 0 ||
      nStr !== String(nVal)
    ) {
      return null;
    }

    if (isWildcard(pStr)) {
      if (op === '=') {
        const lower = parseSemver(`${mVal}.${nVal}.0`);
        const upper = parseSemver(`${mVal}.${nVal + 1}.0-0`);
        if (!lower || !upper) return null;
        return [{ operator: '>=', semver: lower }, { operator: '<', semver: upper }];
      }
      if (op === '>=') {
        const lower = parseSemver(`${mVal}.${nVal}.0`);
        return lower ? [{ operator: '>=', semver: lower }] : null;
      }
      if (op === '>') {
        const lower = parseSemver(`${mVal}.${nVal + 1}.0`);
        return lower ? [{ operator: '>=', semver: lower }] : null;
      }
      if (op === '<=') {
        const upper = parseSemver(`${mVal}.${nVal + 1}.0-0`);
        return upper ? [{ operator: '<', semver: upper }] : null;
      }
      if (op === '<') {
        const upper = parseSemver(`${mVal}.${nVal}.0-0`);
        return upper ? [{ operator: '<', semver: upper }] : null;
      }
    }
  }

  const sv = parseSemver(verStr);
  if (!sv) return null;

  return [{ operator: op === '' ? '=' : op, semver: sv }];
}

/**
 * Parses a caret '^' range token.
 *
 * @param {string} verStr - Version portion after '^'.
 * @returns {Array<{ operator: string, semver: object }>|null} Array of comparators, or null.
 */
function parseCaretRange(verStr) {
  if (isWildcard(verStr)) {
    const sv = parseSemver('0.0.0');
    return sv ? [{ operator: '>=', semver: sv }] : null;
  }

  const [main, prereleaseStr] = verStr.split('-');
  const mainParts = main.split('.');
  if (mainParts.length > 3) return null;

  const [majorStr, minorStr, patchStr] = mainParts;

  if (isWildcard(majorStr)) {
    const sv = parseSemver('0.0.0');
    return sv ? [{ operator: '>=', semver: sv }] : null;
  }

  const mVal = parseInt(majorStr, 10);
  if (Number.isNaN(mVal) || mVal < 0 || majorStr !== String(mVal)) return null;

  if (isWildcard(minorStr)) {
    const lower = parseSemver(`${mVal}.0.0`);
    const upper = parseSemver(`${mVal + 1}.0.0-0`);
    if (!lower || !upper) return null;
    return [{ operator: '>=', semver: lower }, { operator: '<', semver: upper }];
  }

  const nVal = parseInt(minorStr, 10);
  if (Number.isNaN(nVal) || nVal < 0 || minorStr !== String(nVal)) return null;

  if (isWildcard(patchStr)) {
    if (mVal > 0) {
      const lower = parseSemver(`${mVal}.${nVal}.0`);
      const upper = parseSemver(`${mVal + 1}.0.0-0`);
      if (!lower || !upper) return null;
      return [{ operator: '>=', semver: lower }, { operator: '<', semver: upper }];
    }
    const lower = parseSemver(`0.${nVal}.0`);
    const upper = parseSemver(`0.${nVal + 1}.0-0`);
    if (!lower || !upper) return null;
    return [{ operator: '>=', semver: lower }, { operator: '<', semver: upper }];
  }

  const pVal = parseInt(patchStr, 10);
  if (Number.isNaN(pVal) || pVal < 0 || patchStr !== String(pVal)) return null;

  const fullVer = prereleaseStr
    ? `${mVal}.${nVal}.${pVal}-${prereleaseStr}`
    : `${mVal}.${nVal}.${pVal}`;
  const lower = parseSemver(fullVer);
  if (!lower) return null;

  let upperStr;
  if (mVal > 0) {
    upperStr = `${mVal + 1}.0.0-0`;
  } else if (nVal > 0) {
    upperStr = `0.${nVal + 1}.0-0`;
  } else {
    upperStr = `0.0.${pVal + 1}-0`;
  }

  const upper = parseSemver(upperStr);
  if (!upper) return null;

  return [{ operator: '>=', semver: lower }, { operator: '<', semver: upper }];
}

/**
 * Parses a tilde '~' range token.
 *
 * @param {string} verStr - Version portion after '~'.
 * @returns {Array<{ operator: string, semver: object }>|null} Array of comparators, or null.
 */
function parseTildeRange(verStr) {
  if (isWildcard(verStr)) {
    const sv = parseSemver('0.0.0');
    return sv ? [{ operator: '>=', semver: sv }] : null;
  }

  const [main, prereleaseStr] = verStr.split('-');
  const mainParts = main.split('.');
  if (mainParts.length > 3) return null;

  const [majorStr, minorStr, patchStr] = mainParts;

  if (isWildcard(majorStr)) {
    const sv = parseSemver('0.0.0');
    return sv ? [{ operator: '>=', semver: sv }] : null;
  }

  const mVal = parseInt(majorStr, 10);
  if (Number.isNaN(mVal) || mVal < 0 || majorStr !== String(mVal)) return null;

  if (isWildcard(minorStr)) {
    const lower = parseSemver(`${mVal}.0.0`);
    const upper = parseSemver(`${mVal + 1}.0.0-0`);
    if (!lower || !upper) return null;
    return [{ operator: '>=', semver: lower }, { operator: '<', semver: upper }];
  }

  const nVal = parseInt(minorStr, 10);
  if (Number.isNaN(nVal) || nVal < 0 || minorStr !== String(nVal)) return null;

  if (isWildcard(patchStr)) {
    const lower = parseSemver(`${mVal}.${nVal}.0`);
    const upper = parseSemver(`${mVal}.${nVal + 1}.0-0`);
    if (!lower || !upper) return null;
    return [{ operator: '>=', semver: lower }, { operator: '<', semver: upper }];
  }

  const pVal = parseInt(patchStr, 10);
  if (Number.isNaN(pVal) || pVal < 0 || patchStr !== String(pVal)) return null;

  const fullVer = prereleaseStr
    ? `${mVal}.${nVal}.${pVal}-${prereleaseStr}`
    : `${mVal}.${nVal}.${pVal}`;
  const lower = parseSemver(fullVer);
  if (!lower) return null;

  const upper = parseSemver(`${mVal}.${nVal + 1}.0-0`);
  if (!upper) return null;

  return [{ operator: '>=', semver: lower }, { operator: '<', semver: upper }];
}

/**
 * Parses a single token comparator string.
 *
 * @param {string} token - Individual range token (e.g. '^1.2.3', '>=1.0.0').
 * @returns {Array<{ operator: string, semver: object }>|null} Array of comparators, or null.
 */
function parseSingleToken(token) {
  if (!token) return null;

  if (token === '*' || token === 'x' || token === 'X') {
    const sv = parseSemver('0.0.0');
    return sv ? [{ operator: '>=', semver: sv }] : null;
  }

  let op = '';
  let rest = token;

  if (token.startsWith('>=')) {
    op = '>=';
    rest = token.slice(2);
  } else if (token.startsWith('<=')) {
    op = '<=';
    rest = token.slice(2);
  } else if (token.startsWith('>')) {
    op = '>';
    rest = token.slice(1);
  } else if (token.startsWith('<')) {
    op = '<';
    rest = token.slice(1);
  } else if (token.startsWith('=')) {
    op = '=';
    rest = token.slice(1);
  } else if (token.startsWith('^')) {
    op = '^';
    rest = token.slice(1);
  } else if (token.startsWith('~')) {
    op = '~';
    rest = token.slice(1);
  }

  if (rest.startsWith('v') || rest.startsWith('V')) {
    rest = rest.slice(1);
  }

  if (op === '^') {
    return parseCaretRange(rest);
  }
  if (op === '~') {
    return parseTildeRange(rest);
  }
  if (
    op === '>=' ||
    op === '>' ||
    op === '<=' ||
    op === '<' ||
    op === '=' ||
    op === ''
  ) {
    return parsePrimitiveRange(op || '=', rest);
  }

  return null;
}

/**
 * Expands a lower bound version string from a hyphen range.
 *
 * @param {string} verStr - Version string (e.g. '1.2').
 * @returns {Array<{ operator: string, semver: object }>|null} Comparators or null.
 */
function expandLowerHyphen(verStr) {
  let v = verStr;
  if (v.startsWith('v') || v.startsWith('V')) v = v.slice(1);
  const parts = v.split('.');
  if (parts.length === 1) {
    return parseSingleToken(`>=${parts[0]}.0.0`);
  }
  if (parts.length === 2) {
    return parseSingleToken(`>=${parts[0]}.${parts[1]}.0`);
  }
  return parseSingleToken(`>=${v}`);
}

/**
 * Expands an upper bound version string from a hyphen range.
 *
 * @param {string} verStr - Version string (e.g. '2.3').
 * @returns {Array<{ operator: string, semver: object }>|null} Comparators or null.
 */
function expandUpperHyphen(verStr) {
  let v = verStr;
  if (v.startsWith('v') || v.startsWith('V')) v = v.slice(1);
  const parts = v.split('.');
  if (parts.length === 1) {
    const mVal = parseInt(parts[0], 10);
    if (Number.isNaN(mVal)) return null;
    return parseSingleToken(`<${mVal + 1}.0.0-0`);
  }
  if (parts.length === 2) {
    const mVal = parseInt(parts[0], 10);
    const nVal = parseInt(parts[1], 10);
    if (Number.isNaN(mVal) || Number.isNaN(nVal)) return null;
    return parseSingleToken(`<${mVal}.${nVal + 1}.0-0`);
  }
  return parseSingleToken(`<=${v}`);
}

/**
 * Parses a single OR set string (e.g. '>=1.2.3 <2.0.0' or '1.2.3 - 2.3.4').
 *
 * @param {string} orString - Single OR segment.
 * @returns {Array<{ operator: string, semver: object }>|null} Array of comparators, or null.
 */
function parseComparatorSet(orString) {
  const hyphenRegex = new RegExp(
    '^\\s*(v?[\\dxX*]+(?:\\.[\\dxX*]+)*(?:-[0-9A-Za-z.-]+)?(?:\\+[0-9A-Za-z.-]+)?)\\s+-\\s+' +
      '(v?[\\dxX*]+(?:\\.[\\dxX*]+)*(?:-[0-9A-Za-z.-]+)?(?:\\+[0-9A-Za-z.-]+)?)\\s*$'
  );
  const hyphenMatch = orString.match(hyphenRegex);
  if (hyphenMatch) {
    const [, verA, verB] = hyphenMatch;
    const lower = expandLowerHyphen(verA);
    const upper = expandUpperHyphen(verB);
    if (!lower || !upper) return null;
    return [...lower, ...upper];
  }

  const normalized = orString.replace(/(>=|<=|>|<|=|~|\^)\s+/g, '$1');
  const tokens = normalized.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;

  const set = [];
  for (const token of tokens) {
    const comps = parseSingleToken(token);
    if (!comps) return null;
    set.push(...comps);
  }
  return set;
}

/**
 * Parses a range string into normalized comparator sets (OR sets of AND comparators).
 *
 * @param {string} range - Semver range string to parse.
 * @returns {Array<Array<{ operator: string, semver: object }>>|null} Comparator sets or null.
 */
export function parseRange(range) {
  if (typeof range !== 'string') return null;
  const trimmed = range.trim();
  if (!trimmed) return null;

  const orParts = trimmed.split('||');
  const result = [];

  for (const orPart of orParts) {
    const trimmedOr = orPart.trim();
    if (!trimmedOr) return null;

    const set = parseComparatorSet(trimmedOr);
    if (!set || set.length === 0) return null;
    result.push(set);
  }

  return result.length > 0 ? result : null;
}

/**
 * Evaluates whether a semantic version satisfies a given range expression.
 *
 * @param {string|object} version - Version string or parsed version object.
 * @param {string} range - Semver range expression.
 * @returns {boolean} True if version satisfies range; false otherwise.
 */
export function satisfiesRange(version, range) {
  const parsedVer =
    typeof version === 'object' && version !== null && 'major' in version
      ? version
      : parseSemver(version);
  if (!parsedVer) return false;

  const comparatorSets = parseRange(range);
  if (!comparatorSets) return false;

  return comparatorSets.some((set) => {
    for (const comp of set) {
      const res = compareSemver(parsedVer, comp.semver);
      if (res === null) return false;

      let satisfied = false;
      switch (comp.operator) {
        case '=':
          satisfied = res === 0;
          break;
        case '>=':
          satisfied = res >= 0;
          break;
        case '<=':
          satisfied = res <= 0;
          break;
        case '>':
          satisfied = res > 0;
          break;
        case '<':
          satisfied = res < 0;
          break;
        default:
          satisfied = false;
      }
      if (!satisfied) return false;
    }

    if (parsedVer.prerelease && parsedVer.prerelease.length > 0) {
      const hasMatchingPrereleaseComp = set.some((comp) => {
        return (
          comp.semver.prerelease &&
          comp.semver.prerelease.length > 0 &&
          comp.semver.major === parsedVer.major &&
          comp.semver.minor === parsedVer.minor &&
          comp.semver.patch === parsedVer.patch
        );
      });
      if (!hasMatchingPrereleaseComp) return false;
    }

    return true;
  });
}
