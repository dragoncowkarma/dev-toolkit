const PAGE_SIZE = 4096;
const SIGNATURE_OFFSET = PAGE_SIZE - 10;
const BADPAGES_OFFSET = 1536;

/** Decode whitespace-separated or continuous hexadecimal bytes. */
export function decodeHex(input) {
  const hex = input.replace(/\s/g, '');
  if (!/^[\da-f]*$/i.test(hex) || hex.length % 2 !== 0) {
    throw new Error('Enter complete hexadecimal bytes separated by whitespace.');
  }
  return Uint8Array.from(hex.match(/../g) || [], (byte) => parseInt(byte, 16));
}

function formatSize(bytes) {
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  let unit = 0;
  let divisor = 1n;
  while (bytes >= divisor * 1024n && unit < units.length - 1) {
    divisor *= 1024n;
    unit += 1;
  }
  const tenths = (bytes * 10n + divisor / 2n) / divisor;
  return String(tenths / 10n) + '.' + String(tenths % 10n) + ' ' + units[unit];
}

/** Parse the first 4096-byte page of a Linux swap area. */
export function parseSwapHeader(bytes) {
  if (bytes.byteLength < PAGE_SIZE) {
    throw new Error('Truncated input: a complete 4096-byte first page is required.');
  }
  const page = bytes.subarray(0, PAGE_SIZE);
  const signature = String.fromCharCode(...page.subarray(SIGNATURE_OFFSET));
  if (signature !== 'SWAPSPACE2' && signature !== 'SWAP-SPACE') {
    throw new Error('Invalid swap signature in the first page.');
  }
  const view = new DataView(page.buffer, page.byteOffset, page.byteLength);
  const littleEndian = view.getUint32(1024, true) === 1;
  if (!littleEndian && view.getUint32(1024, false) !== 1) {
    throw new Error('Unsupported swap header version (expected version 1).');
  }
  const read = (offset) => view.getUint32(offset, littleEndian);
  const lastPage = read(1028);
  const badPageCount = read(1032);
  const uuidHex = Array.from(page.subarray(1036, 1052), (byte) =>
    byte.toString(16).padStart(2, '0')).join('');
  const uuid = [uuidHex.slice(0, 8), uuidHex.slice(8, 12), uuidHex.slice(12, 16),
    uuidHex.slice(16, 20), uuidHex.slice(20)].join('-');
  const labelBytes = page.subarray(1052, 1068);
  const terminator = labelBytes.indexOf(0);
  const label = new TextDecoder().decode(
    terminator < 0 ? labelBytes : labelBytes.subarray(0, terminator),
  );
  const padding = Array.from({ length: 117 }, (_, index) => read(1068 + index * 4));
  const listedCount = Math.min(badPageCount, 1536,
    Math.floor((SIGNATURE_OFFSET - BADPAGES_OFFSET) / 4));
  const badPages = Array.from({ length: listedCount }, (_, index) =>
    read(BADPAGES_OFFSET + index * 4));
  const sizeBytes = (BigInt(lastPage) + 1n) * BigInt(PAGE_SIZE);
  return {
    signature, version: 1, byteOrder: littleEndian ? 'Little-endian' : 'Big-endian',
    lastPage, badPageCount, uuid, label, padding, badPages,
    sizeBytes: sizeBytes.toString(), sizeHuman: formatSize(sizeBytes),
  };
}

/** Read at most the first page of a selected file. */
export function readFirstPage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result));
    reader.onerror = () => reject(new Error('Failed to read the selected file.'));
    reader.readAsArrayBuffer(file.slice(0, PAGE_SIZE));
  });
}
