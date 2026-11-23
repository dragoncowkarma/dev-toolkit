const HEADER_SIZE = 88;

/** Decode user-provided hexadecimal or Base64 bytes without throwing. */
export function decodeInput(input, format) {
  try {
    const text = input.replace(/\s/g, '');
    if (format === 'hex') {
      if (!text || text.length % 2 || !/^[0-9a-f]+$/i.test(text)) {
        return { ok: false, error: 'Enter an even number of hexadecimal digits.' };
      }
      return { ok: true, bytes: Uint8Array.from(text.match(/../g), (pair) => parseInt(pair, 16)) };
    }
    if (format !== 'base64' || !text || text.length % 4 ||
        !/^[A-Za-z0-9+/]*={0,2}$/.test(text)) {
      return { ok: false, error: 'Enter valid padded Base64 input.' };
    }
    const binary = atob(text);
    return { ok: true, bytes: Uint8Array.from(binary, (char) => char.charCodeAt(0)) };
  } catch {
    return { ok: false, error: 'Could not decode the input.' };
  }
}

/** Parse an EMR_HEADER from an ArrayBuffer or byte array, returning an error for invalid data. */
export function parseEmfHeader(input) {
  try {
    const bytes = input instanceof ArrayBuffer ? new Uint8Array(input) : input;
    if (!(bytes instanceof Uint8Array) || bytes.byteLength < HEADER_SIZE) {
      return { ok: false, error: 'The EMF header is truncated.' };
    }
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const u32 = (offset) => view.getUint32(offset, true);
    const i32 = (offset) => view.getInt32(offset, true);
    const rect = (offset) => [0, 4, 8, 12].map((delta) => i32(offset + delta));
    const recordType = u32(0);
    const recordSize = u32(4);
    if (recordType !== 1) return { ok: false, error: 'Invalid EMR_HEADER record type.' };
    if (recordSize < HEADER_SIZE || recordSize > bytes.length) {
      return { ok: false, error: 'Invalid or truncated header record size.' };
    }
    if (u32(40) !== 0x464d4520) return { ok: false, error: 'Invalid EMF signature.' };
    const fileBytes = u32(48);
    if (fileBytes !== bytes.length || fileBytes < recordSize) {
      return { ok: false, error: 'Declared file size does not match the input length.' };
    }
    const descriptionLength = u32(60);
    const descriptionOffset = u32(64);
    if (descriptionLength && (descriptionOffset < HEADER_SIZE || descriptionOffset % 2 ||
        descriptionOffset + descriptionLength * 2 > recordSize)) {
      return { ok: false, error: 'Description lies outside the header record.' };
    }
    const description = descriptionLength
      ? new TextDecoder('utf-16le').decode(
        bytes.subarray(descriptionOffset, descriptionOffset + descriptionLength * 2)
      ).replace(/\0+$/, '').replace(/\0/g, ' / ')
      : '';
    return { ok: true, header: {
      recordType, recordSize, bounds: rect(8), frame: rect(24), signature: ' EMF',
      version: u32(44), fileBytes, recordCount: u32(52), handleCount: view.getUint16(56, true),
      descriptionLength, descriptionOffset, description, paletteEntries: u32(68),
      device: [i32(72), i32(76)], millimeters: [i32(80), i32(84)],
    } };
  } catch {
    return { ok: false, error: 'Could not parse the EMF header.' };
  }
}
