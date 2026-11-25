const BANK_SIZE = 8192;
const COPIER_HEADER_SIZE = 512;

function reverseBits(value) {
  let result = 0;
  for (let bit = 0; bit < 8; bit += 1) {
    result = (result << 1) | ((value >> bit) & 1);
  }
  return result;
}

function validVector(vector) {
  return vector >= 0xe000 && vector <= 0xffff;
}

/**
 * Inspect the last complete bank using only its two reset-vector bytes.
 * @param {Blob} file Local ROM file.
 * @returns {Promise<object>} Size, vector and heuristic information.
 */
export async function inspectRom(file) {
  const hasCopierHeader = file.size % BANK_SIZE === COPIER_HEADER_SIZE;
  const headerSize = hasCopierHeader ? COPIER_HEADER_SIZE : 0;
  const romSize = file.size - headerSize;
  const bankCount = Math.floor(romSize / BANK_SIZE);
  const aligned = romSize % BANK_SIZE === 0;
  const result = {
    hasCopierHeader, romSize, bankCount, aligned, resetVector: null,
    vectorInRange: null, bitReversed: null,
  };
  if (bankCount === 0) return result;

  const end = headerSize + bankCount * BANK_SIZE;
  const buffer = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Failed to read the ROM.'));
    reader.onabort = () => reject(new Error('ROM read was aborted.'));
    reader.readAsArrayBuffer(file.slice(end - 2, end));
  });
  const bytes = new Uint8Array(buffer);
  if (bytes.length !== 2) return result;
  const resetVector = bytes[0] | (bytes[1] << 8);
  const reversed = reverseBits(bytes[0]) | (reverseBits(bytes[1]) << 8);
  const normalValid = validVector(resetVector);
  const reversedValid = validVector(reversed);
  return {
    ...result,
    resetVector,
    vectorInRange: normalValid,
    bitReversed: normalValid === reversedValid ? null : reversedValid,
  };
}
