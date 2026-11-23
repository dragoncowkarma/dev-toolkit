function formatGuid(view, offset) {
  const hex = (value, width) => value.toString(16).padStart(width, '0');
  const bytes = Array.from({ length: 8 }, (_, index) => hex(view.getUint8(offset + 8 + index), 2));
  return `${hex(view.getUint32(offset, true), 8)}-${hex(view.getUint16(offset + 4, true), 4)}-`
    + `${hex(view.getUint16(offset + 6, true), 4)}-${bytes.slice(0, 2).join('')}-`
    + bytes.slice(2).join('');
}

/** Parse an ITSF v2 or v3 header from an ArrayBuffer. */
export function parseChmHeader(buffer) {
  const view = new DataView(buffer);
  if (view.byteLength < 4) throw new Error('Truncated file: missing ITSF signature.');
  const signature = String.fromCharCode(...new Uint8Array(buffer, 0, 4));
  if (signature !== 'ITSF') throw new Error('Invalid signature: expected ITSF.');
  if (view.byteLength < 12) throw new Error('Truncated file: incomplete ITSF header.');
  const version = view.getUint32(4, true);
  if (version !== 2 && version !== 3) throw new Error(`Unsupported ITSF version: ${version}.`);
  const headerLength = view.getUint32(8, true);
  const minimumLength = version === 3 ? 96 : 88;
  if (headerLength < minimumLength || view.byteLength < minimumLength) {
    throw new Error('Truncated file: incomplete ITSF header.');
  }
  const result = {
    Signature: signature,
    Version: version,
    'Header length': headerLength,
    'Language ID': view.getUint32(20, true),
    'Directory GUID 1': formatGuid(view, 24),
    'Directory GUID 2': formatGuid(view, 40),
    'Section 0 offset': view.getBigUint64(56, true).toString(),
    'Section 0 length': view.getBigUint64(64, true).toString(),
    'Directory offset': view.getBigUint64(72, true).toString(),
    'Directory length': view.getBigUint64(80, true).toString(),
  };
  if (version === 3) result['Content offset'] = view.getBigUint64(88, true).toString();
  return result;
}
