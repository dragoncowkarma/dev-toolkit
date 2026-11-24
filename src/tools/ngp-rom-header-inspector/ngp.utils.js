const LICENSES = new Set([
  'COPYRIGHT BY SNK CORPORATION',
  'LICENSED BY SNK CORPORATION',
]);

function asciiField(bytes) {
  const text = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
  const trimmed = text.replace(/^[\x00\x20]+|[\x00\x20]+$/g, '');
  return trimmed && /^[\x20-\x7e]+$/.test(trimmed) ? trimmed : 'Unknown';
}

function hex(value, width) {
  return `0x${value.toString(16).toUpperCase().padStart(width, '0')}`;
}

/** Parses the first 64 bytes of a Neo Geo Pocket cartridge ROM. */
export function parseNgpHeader(buffer) {
  if (buffer.byteLength < 64) throw new Error('File is truncated: a 64-byte header is required.');
  const bytes = new Uint8Array(buffer, 0, 64);
  const view = new DataView(buffer, 0, 64);
  const license = asciiField(bytes.subarray(0, 28));
  const mode = bytes[35];
  return {
    license: LICENSES.has(license) ? license : 'Unknown',
    startupAddress: hex(view.getUint32(28, true), 8),
    softwareId: hex(view.getUint16(32, true), 4),
    version: hex(bytes[34], 2),
    colorMode: mode === 0 ? 'Monochrome NGP' : mode === 0x10 ? 'NGPC' : 'Unknown',
    title: asciiField(bytes.subarray(36, 48)),
  };
}

/** Reads only the header of a selected file. */
export function readNgpHeader(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Failed to read the selected file.'));
    reader.onabort = () => reject(new Error('File read was aborted.'));
    reader.readAsArrayBuffer(file.slice(0, 64));
  });
}
