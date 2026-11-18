const MACHINE_TYPES = {
  0x014c: 'Intel 386',
  0x0200: 'Intel Itanium',
  0x8664: 'x64',
  0xaa64: 'ARM64',
};

const SUBSYSTEMS = {
  1: 'Native',
  2: 'Windows GUI',
  3: 'Windows CUI',
  7: 'POSIX CUI',
  9: 'Windows CE GUI',
  10: 'EFI Application',
  11: 'EFI Boot Service Driver',
  12: 'EFI Runtime Driver',
  13: 'EFI ROM',
  14: 'Xbox',
  16: 'Windows Boot Application',
};

const COFF_CHARACTERISTICS = [
  [0x0002, 'Executable image'],
  [0x0020, 'Large address aware'],
  [0x0100, '32-bit machine'],
  [0x0200, 'Debug information stripped'],
  [0x2000, 'DLL'],
  [0x1000, 'System file'],
];

const DLL_CHARACTERISTICS = [
  [0x0020, 'High entropy VA'],
  [0x0040, 'Dynamic base'],
  [0x0080, 'Force integrity'],
  [0x0100, 'NX compatible'],
  [0x0400, 'No SEH'],
  [0x0800, 'No bind'],
  [0x1000, 'AppContainer'],
  [0x4000, 'Control flow guard'],
  [0x8000, 'Terminal server aware'],
];

const SECTION_CHARACTERISTICS = [
  [0x00000020, 'Code'],
  [0x00000040, 'Initialized data'],
  [0x00000080, 'Uninitialized data'],
  [0x20000000, 'Executable'],
  [0x40000000, 'Readable'],
  [0x80000000, 'Writable'],
];

function parseError(path, message) {
  return new Error(`PE parse error at ${path}: ${message}`);
}

function requireRange(bytes, offset, size, path) {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(size) || offset < 0 || size < 0 ||
    offset > bytes.byteLength - size) {
    throw parseError(path, `requires ${size} bytes at offset 0x${offset.toString(16)}.`);
  }
}

function flagsFor(value, definitions) {
  return definitions.filter(([flag]) => (value & flag) !== 0).map(([, name]) => name);
}

function hex(value, width) {
  return `0x${value.toString(16).toUpperCase().padStart(width, '0')}`;
}

function readSectionName(bytes, offset) {
  requireRange(bytes, offset, 8, 'section.name');
  const end = bytes.slice(offset, offset + 8).indexOf(0);
  return new TextDecoder('ascii').decode(bytes.slice(offset, offset + (end === -1 ? 8 : end)));
}

/**
 * Decodes a Base64 string into raw bytes without using external dependencies.
 * @param {string} value - Base64-encoded bytes.
 * @returns {Uint8Array} Decoded bytes.
 */
export function decodeBase64Bytes(value) {
  if (typeof value !== 'string') {
    throw new TypeError('Base64 input must be a string.');
  }
  const cleaned = value.replace(/\s/g, '');
  if (!cleaned || cleaned.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(cleaned)) {
    throw new Error('Invalid Base64 input.');
  }
  try {
    return Uint8Array.from(atob(cleaned), (character) => character.charCodeAt(0));
  } catch {
    throw new Error('Invalid Base64 input.');
  }
}

/**
 * Parses the headers and section table of a Windows PE/COFF executable.
 * @param {ArrayBuffer|Uint8Array} input - PE file bytes.
 * @returns {object} Parsed PE header data suitable for rendering.
 * @throws {Error} When the input is malformed or truncated.
 */
export function parsePeHeaders(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  requireRange(bytes, 0, 2, 'dos.signature');
  if (view.getUint16(0, true) !== 0x5a4d) {
    throw parseError('dos.signature', 'expected MZ signature.');
  }
  requireRange(bytes, 0x3c, 4, 'dos.e_lfanew');
  const peOffset = view.getUint32(0x3c, true);
  requireRange(bytes, peOffset, 4, 'pe.signature');
  if (view.getUint32(peOffset, true) !== 0x00004550) {
    throw parseError('pe.signature', 'expected PE\\0\\0 signature.');
  }

  const coffOffset = peOffset + 4;
  requireRange(bytes, coffOffset, 20, 'coff.header');
  const machine = view.getUint16(coffOffset, true);
  const sectionCount = view.getUint16(coffOffset + 2, true);
  const timestamp = view.getUint32(coffOffset + 4, true);
  const optionalHeaderSize = view.getUint16(coffOffset + 16, true);
  const coffCharacteristics = view.getUint16(coffOffset + 18, true);
  const optionalOffset = coffOffset + 20;
  requireRange(bytes, optionalOffset, optionalHeaderSize, 'optionalHeader');
  requireRange(bytes, optionalOffset, 2, 'optionalHeader.magic');
  const magic = view.getUint16(optionalOffset, true);
  const isPe32Plus = magic === 0x20b;
  if (magic !== 0x10b && !isPe32Plus) {
    throw parseError('optionalHeader.magic', `unsupported magic ${hex(magic, 4)}.`);
  }
  if (optionalHeaderSize < 72) {
    throw parseError('optionalHeader', 'is too short for required PE fields.');
  }
  requireRange(bytes, optionalOffset + 16, 4, 'optionalHeader.addressOfEntryPoint');
  requireRange(bytes, optionalOffset + 68, 4, 'optionalHeader.subsystem');
  const entryPoint = view.getUint32(optionalOffset + 16, true);
  const imageBase = isPe32Plus
    ? view.getBigUint64(optionalOffset + 24, true)
    : BigInt(view.getUint32(optionalOffset + 28, true));
  const subsystem = view.getUint16(optionalOffset + 68, true);
  const dllCharacteristics = view.getUint16(optionalOffset + 70, true);
  const sectionsOffset = optionalOffset + optionalHeaderSize;
  const sections = [];
  for (let index = 0; index < sectionCount; index += 1) {
    const offset = sectionsOffset + index * 40;
    const path = `sections[${index}]`;
    requireRange(bytes, offset, 40, path);
    const characteristics = view.getUint32(offset + 36, true);
    sections.push({
      name: readSectionName(bytes, offset),
      virtualSize: view.getUint32(offset + 8, true),
      virtualAddress: view.getUint32(offset + 12, true),
      rawDataSize: view.getUint32(offset + 16, true),
      rawDataPointer: view.getUint32(offset + 20, true),
      characteristics: hex(characteristics, 8),
      flags: flagsFor(characteristics, SECTION_CHARACTERISTICS),
    });
  }

  return {
    dos: { peOffset: hex(peOffset, 8) },
    coff: {
      machine: `${MACHINE_TYPES[machine] ?? 'Unknown'} (${hex(machine, 4)})`,
      sectionCount,
      timestamp: new Date(timestamp * 1000).toISOString(),
      characteristics: hex(coffCharacteristics, 4),
      flags: flagsFor(coffCharacteristics, COFF_CHARACTERISTICS),
    },
    optional: {
      format: isPe32Plus ? 'PE32+ (64-bit)' : 'PE32 (32-bit)',
      entryPoint: hex(entryPoint, 8),
      imageBase: hex(imageBase, isPe32Plus ? 16 : 8),
      subsystem: `${SUBSYSTEMS[subsystem] ?? 'Unknown'} (${hex(subsystem, 4)})`,
      dllCharacteristics: hex(dllCharacteristics, 4),
      flags: flagsFor(dllCharacteristics, DLL_CHARACTERISTICS),
    },
    sections,
  };
}
