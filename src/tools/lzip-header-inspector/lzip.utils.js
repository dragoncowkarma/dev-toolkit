/** Decode pasted hexadecimal or Base64 text, reporting invalid input without throwing. */
export function decodeInput(text, format) {
  const clean = text.replace(/\s/g, '');
  if (format === 'hex') {
    if (!/^(?:[0-9a-fA-F]{2})*$/.test(clean)) {
      return { error: 'Enter complete hexadecimal byte pairs.' };
    }
    return { bytes: Uint8Array.from(clean.match(/../g) || [], (byte) => parseInt(byte, 16)) };
  }
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(clean)) {
    return { error: 'Enter valid padded Base64.' };
  }
  try {
    const decoded = atob(clean);
    return { bytes: Uint8Array.from(decoded, (char) => char.charCodeAt(0)) };
  } catch {
    return { error: 'Enter valid padded Base64.' };
  }
}

/** Inspect a lzip header and, for v1, the possible trailing 20 bytes. */
export function inspectLzip(bytes) {
  const errors = [];
  if (bytes.length < 6) return { errors: ['Truncated input: a header requires 6 bytes.'] };
  if (![0x4c, 0x5a, 0x49, 0x50].every((value, i) => bytes[i] === value)) {
    errors.push('Bad magic: expected LZIP.');
  }
  const version = bytes[4];
  if (version !== 0 && version !== 1) errors.push('Unsupported version.');
  const code = bytes[5];
  const exponent = code & 31;
  const base = 2 ** exponent;
  const dictionarySize = base - (base / 16) * (code >> 5);
  if (dictionarySize < 4096 || dictionarySize > 512 * 1024 * 1024) {
    errors.push('Invalid dictionary size code.');
  }
  const result = { version, code, dictionarySize, errors };
  if (version === 1 && bytes.length > 6 && bytes.length < 26) {
    errors.push('Truncated input: a v1 header and trailer require at least 26 bytes.');
  }
  if (version === 1 && bytes.length >= 26) {
    const view = new DataView(bytes.buffer, bytes.byteOffset + bytes.length - 20, 20);
    result.trailer = {
      crc32: view.getUint32(0, true),
      dataSize: view.getBigUint64(4, true),
      memberSize: view.getBigUint64(12, true),
    };
    if (result.trailer.memberSize !== BigInt(bytes.length)) {
      errors.push('Member size does not match input length.');
    }
  }
  return result;
}
