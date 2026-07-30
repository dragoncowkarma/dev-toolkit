const PERMISSION_CLASSES = ['owner', 'group', 'others'];
const PERMISSION_BITS = { read: 4, write: 2, execute: 1 };
const SPECIAL_BITS = { setuid: 4, setgid: 2, sticky: 1 };

/**
 * Parses a three- or four-digit octal permission value.
 * @param {string|number} value
 * @returns {number|null} A mode from 0 to 4095, or null for invalid input.
 */
export function parseOctal(value) {
  const text = String(value).trim();
  const match = text.match(/^0?([0-7]{3,4})$/);
  if (!match) return null;
  return Number.parseInt(match[1], 8);
}

/**
 * Converts a numeric chmod mode to its zero-padded octal representation.
 * @param {number} mode
 * @returns {string}
 */
export function formatOctal(mode) {
  const normalized = Number.isInteger(mode) && mode >= 0 && mode <= 0o7777 ? mode : 0;
  return normalized.toString(8).padStart(3, '0');
}

/**
 * Parses a symbolic permission value, optionally including a file type prefix.
 * @param {string} value
 * @returns {number|null} A mode from 0 to 4095, or null for invalid input.
 */
export function parseSymbolic(value) {
  const text = String(value).trim();
  const permissions = text.length === 10 ? text.slice(1) : text;
  if (!/^[rwxstST-]{9}$/.test(permissions)) return null;

  let mode = 0;
  for (let index = 0; index < 3; index += 1) {
    const segment = permissions.slice(index * 3, index * 3 + 3);
    let digit = 0;
    if (segment[0] === 'r') digit += 4;
    if (segment[1] === 'w') digit += 2;
    if (segment[2] === 'x' || segment[2] === 's' || segment[2] === 't') digit += 1;
    mode |= digit << ((2 - index) * 3);
  }
  if (permissions[2] === 's' || permissions[2] === 'S') mode |= 0o4000;
  if (permissions[5] === 's' || permissions[5] === 'S') mode |= 0o2000;
  if (permissions[8] === 't' || permissions[8] === 'T') mode |= 0o1000;
  return mode;
}

/**
 * Converts a numeric chmod mode to a symbolic file permission string.
 * @param {number} mode
 * @param {string} [fileType='-']
 * @returns {string}
 */
export function formatSymbolic(mode, fileType = '-') {
  const normalized = Number.isInteger(mode) && mode >= 0 && mode <= 0o7777 ? mode : 0;
  const special = (normalized >> 9) & 0o7;
  const digits = [(normalized >> 6) & 0o7, (normalized >> 3) & 0o7, normalized & 0o7];
  return fileType + digits.map((digit, index) => {
    const execute = digit & 1 ? 'x' : '-';
    const specialBit = special & (4 >> index);
    const specialCharacter = index === 2 ? 't' : 's';
    const noExecuteCharacter = index === 2 ? 'T' : 'S';
    return `${digit & 4 ? 'r' : '-'}${digit & 2 ? 'w' : '-'}${specialBit
      ? (execute === 'x' ? specialCharacter : noExecuteCharacter)
      : execute}`;
  }).join('');
}

/**
 * Returns checkbox-friendly permission data for a numeric chmod mode.
 * @param {number} mode
 * @returns {{
 *   permissions: Record<string, Record<string, boolean>>,
 *   special: Record<string, boolean>
 * }}
 */
export function modeToMatrix(mode) {
  const normalized = Number.isInteger(mode) && mode >= 0 && mode <= 0o7777 ? mode : 0;
  const permissions = Object.fromEntries(PERMISSION_CLASSES.map((permissionClass, index) => {
    const digit = (normalized >> ((2 - index) * 3)) & 0o7;
    return [permissionClass, Object.fromEntries(
      Object.entries(PERMISSION_BITS).map(([permission, bit]) => [
        permission,
        Boolean(digit & bit),
      ]),
    )];
  }));
  const specialDigit = (normalized >> 9) & 0o7;
  const special = Object.fromEntries(
    Object.entries(SPECIAL_BITS).map(([name, bit]) => [name, Boolean(specialDigit & bit)]),
  );
  return { permissions, special };
}

/**
 * Converts checkbox-friendly permission data to a numeric chmod mode.
 * @param {{
 *   permissions: Record<string, Record<string, boolean>>,
 *   special: Record<string, boolean>
 * }} matrix
 * @returns {number}
 */
export function matrixToMode(matrix) {
  const permissionMode = PERMISSION_CLASSES.reduce((mode, permissionClass, index) => {
    const digit = Object.entries(PERMISSION_BITS).reduce(
      (sum, [permission, bit]) => (
        sum + (matrix.permissions[permissionClass]?.[permission] ? bit : 0)
      ),
      0,
    );
    return mode | (digit << ((2 - index) * 3));
  }, 0);
  const specialMode = Object.entries(SPECIAL_BITS).reduce(
    (sum, [name, bit]) => sum + (matrix.special[name] ? bit : 0),
    0,
  );
  return permissionMode | (specialMode << 9);
}

/**
 * Builds a chmod command for a mode and target filename.
 * @param {number} mode
 * @param {string} [filename='filename']
 * @returns {string}
 */
export function formatChmodCommand(mode, filename = 'filename') {
  return `chmod ${formatOctal(mode)} ${filename.trim() || 'filename'}`;
}
