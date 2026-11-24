export const HEADER_SIZE = 0x24;
export const PREFIX_SIZE = 0x8000;

/** Parse a bounded ColecoVision ROM prefix and its original file size. */
export function parseColecoVision(bytes, size = bytes.length) {
  if (size < HEADER_SIZE || bytes.length < HEADER_SIZE) {
    throw new Error('File is too short for the 36-byte ColecoVision header.');
  }
  const titleScreen = bytes[0] === 0xaa && bytes[1] === 0x55;
  if (!titleScreen && !(bytes[0] === 0x55 && bytes[1] === 0xaa)) {
    throw new Error('Invalid ColecoVision cartridge signature.');
  }
  const word = (offset) => bytes[offset] | (bytes[offset + 1] << 8);
  const labels = ['Sprite name table', 'Sprite order table', 'Working buffer',
    'Controller input', 'Start address'];
  const pointers = labels.map((label, index) => ({ label, value: word(2 + index * 2) }));
  const vectors = Array.from({ length: 8 }, (_, index) => ({
    label: index === 7 ? 'NMI' : `RST ${(index + 1) * 8}`,
    bytes: Array.from(bytes.slice(12 + index * 3, 15 + index * 3)),
  }));
  let title = null;
  if (titleScreen) {
    const limit = Math.min(size, bytes.length);
    let cursor = HEADER_SIZE;
    const readLine = () => {
      const start = cursor;
      while (cursor < limit && bytes[cursor] !== 0x2f) cursor += 1;
      if (cursor >= limit) throw new Error('Title text is incomplete or outside the file.');
      const line = String.fromCharCode(...bytes.slice(start, cursor));
      cursor += 1;
      return line;
    };
    const line2 = readLine();
    const line1 = readLine();
    if (cursor + 4 > limit) throw new Error('Title year is incomplete or outside the file.');
    title = { line1, line2, year: String.fromCharCode(...bytes.slice(cursor, cursor + 4)) };
  }
  return { titleScreen, pointers, vectors, title, size,
    unaligned: size % 8192 !== 0, oversized: size > 32768 };
}
