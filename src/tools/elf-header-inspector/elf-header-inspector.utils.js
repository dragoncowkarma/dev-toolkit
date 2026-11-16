const ELF_MAGIC = [0x7f, 0x45, 0x4c, 0x46];

const CLASS_NAMES = { 1: 'ELF32', 2: 'ELF64' };
const DATA_NAMES = { 1: 'Little endian', 2: 'Big endian' };
const VERSION_NAMES = { 0: 'Invalid', 1: 'Current' };
const OS_ABI_NAMES = {
  0: 'System V', 1: 'HP-UX', 2: 'NetBSD', 3: 'Linux', 6: 'Solaris', 7: 'AIX',
  8: 'IRIX', 9: 'FreeBSD', 12: 'OpenBSD', 64: 'ARM EABI', 97: 'ARM', 255: 'Standalone',
};
const TYPE_NAMES = {
  0: 'ET_NONE', 1: 'ET_REL', 2: 'ET_EXEC', 3: 'ET_DYN', 4: 'ET_CORE',
};
const MACHINE_NAMES = {
  0: 'No machine', 3: 'Intel 80386', 8: 'MIPS', 20: 'PowerPC', 21: 'PowerPC64',
  40: 'ARM', 50: 'Intel IA-64', 62: 'AMD x86-64', 183: 'AArch64', 243: 'RISC-V',
};
const PROGRAM_TYPE_NAMES = {
  0: 'PT_NULL', 1: 'PT_LOAD', 2: 'PT_DYNAMIC', 3: 'PT_INTERP', 4: 'PT_NOTE',
  5: 'PT_SHLIB', 6: 'PT_PHDR', 7: 'PT_TLS', 0x6474e550: 'PT_GNU_EH_FRAME',
  0x6474e551: 'PT_GNU_STACK', 0x6474e552: 'PT_GNU_RELRO',
};
const SECTION_TYPE_NAMES = {
  0: 'SHT_NULL', 1: 'SHT_PROGBITS', 2: 'SHT_SYMTAB', 3: 'SHT_STRTAB', 4: 'SHT_RELA',
  5: 'SHT_HASH', 6: 'SHT_DYNAMIC', 7: 'SHT_NOTE', 8: 'SHT_NOBITS', 9: 'SHT_REL',
  10: 'SHT_SHLIB', 11: 'SHT_DYNSYM', 14: 'SHT_INIT_ARRAY', 15: 'SHT_FINI_ARRAY',
  16: 'SHT_PREINIT_ARRAY', 17: 'SHT_GROUP', 18: 'SHT_SYMTAB_SHNDX',
};

/**
 * Formats an ELF integer as a hexadecimal string.
 * @param {number|bigint} value
 * @returns {string}
 */
export function formatHex(value) {
  return `0x${value.toString(16)}`;
}

function namedValue(names, value) {
  return names[value] ? `${names[value]} (${formatHex(value)})` : formatHex(value);
}

function programFlags(value) {
  const labels = [];
  if (value & 4) labels.push('R');
  if (value & 2) labels.push('W');
  if (value & 1) labels.push('E');
  return `${labels.join('') || '-'} (${formatHex(value)})`;
}

function sectionFlags(value) {
  const flags = BigInt(value);
  const labels = [];
  if (flags & 1n) labels.push('WRITE');
  if (flags & 2n) labels.push('ALLOC');
  if (flags & 4n) labels.push('EXEC');
  return `${labels.join(', ') || '-'} (${formatHex(flags)})`;
}

function parseError(path, message) {
  return new Error(`${path}: ${message}`);
}

function requireRange(bytes, offset, length, path) {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0 ||
      offset + length > bytes.length) {
    throw parseError(
      path, `out of range (offset ${offset}, length ${length}, file ${bytes.length})`,
    );
  }
}

function asSafeNumber(value, path) {
  if (typeof value === 'bigint' && value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw parseError(path, `offset ${formatHex(value)} exceeds browser-safe range`);
  }
  return Number(value);
}

function createReader(bytes, littleEndian) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const read = (offset, size, path) => {
    requireRange(bytes, offset, size, path);
    if (size === 2) return view.getUint16(offset, littleEndian);
    if (size === 4) return view.getUint32(offset, littleEndian);
    if (size === 8) return view.getBigUint64(offset, littleEndian);
    throw new Error(`Unsupported ELF integer width: ${size}`);
  };
  return read;
}

function readString(bytes, offset, length, path) {
  requireRange(bytes, offset, length, path);
  const end = bytes.indexOf(0, offset);
  const limit = end === -1 ? offset + length : Math.min(end, offset + length);
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes.slice(offset, limit));
}

function parseProgramHeaders(bytes, header, read) {
  const headers = [];
  const is64 = header.class === 2;
  const entrySize = is64 ? 56 : 32;
  if (header.programHeaderCount === 0) return headers;
  if (header.programHeaderEntrySize < entrySize) {
    throw parseError(
      'ELF header.e_phentsize',
      `expected at least ${entrySize}, got ${header.programHeaderEntrySize}`,
    );
  }
  const tableOffset = asSafeNumber(header.programHeaderOffset, 'ELF header.e_phoff');
  requireRange(bytes, tableOffset, header.programHeaderEntrySize * header.programHeaderCount,
    'program headers');
  for (let index = 0; index < header.programHeaderCount; index += 1) {
    const base = tableOffset + index * header.programHeaderEntrySize;
    const path = `program headers[${index}]`;
    const type = read(base, 4, `${path}.type`);
    const flags = read(base + (is64 ? 4 : 24), 4, `${path}.flags`);
    const offset = read(base + (is64 ? 8 : 4), is64 ? 8 : 4, `${path}.offset`);
    const vaddr = read(base + (is64 ? 16 : 8), is64 ? 8 : 4, `${path}.vaddr`);
    const paddr = read(base + (is64 ? 24 : 12), is64 ? 8 : 4, `${path}.paddr`);
    const filesz = read(base + (is64 ? 32 : 16), is64 ? 8 : 4, `${path}.filesz`);
    const memsz = read(base + (is64 ? 40 : 20), is64 ? 8 : 4, `${path}.memsz`);
    const align = read(base + (is64 ? 48 : 28), is64 ? 8 : 4, `${path}.align`);
    headers.push({ type: namedValue(PROGRAM_TYPE_NAMES, type), flags: programFlags(flags), offset,
      vaddr, paddr, filesz, memsz, align });
  }
  return headers;
}

function parseSectionHeaders(bytes, header, read) {
  const sections = [];
  const is64 = header.class === 2;
  const entrySize = is64 ? 64 : 40;
  if (header.sectionHeaderCount === 0) return sections;
  if (header.sectionHeaderEntrySize < entrySize) {
    throw parseError(
      'ELF header.e_shentsize',
      `expected at least ${entrySize}, got ${header.sectionHeaderEntrySize}`,
    );
  }
  const tableOffset = asSafeNumber(header.sectionHeaderOffset, 'ELF header.e_shoff');
  requireRange(bytes, tableOffset, header.sectionHeaderEntrySize * header.sectionHeaderCount,
    'section headers');
  const rawSections = [];
  for (let index = 0; index < header.sectionHeaderCount; index += 1) {
    const base = tableOffset + index * header.sectionHeaderEntrySize;
    const path = `section headers[${index}]`;
    rawSections.push({ nameOffset: read(base, 4, `${path}.name`), type: read(base + 4, 4,
      `${path}.type`), flags: read(base + 8, is64 ? 8 : 4, `${path}.flags`), addr: read(base +
      (is64 ? 16 : 12), is64 ? 8 : 4, `${path}.addr`), offset: read(base + (is64 ? 24 : 16),
      is64 ? 8 : 4, `${path}.offset`), size: read(base + (is64 ? 32 : 20), is64 ? 8 : 4,
      `${path}.size`), link: read(base + (is64 ? 40 : 24), 4, `${path}.link`), info: read(base +
      (is64 ? 44 : 28), 4, `${path}.info`), addralign: read(base + (is64 ? 48 : 32), is64 ? 8 : 4,
      `${path}.addralign`), entsize: read(base + (is64 ? 56 : 36), is64 ? 8 : 4,
      `${path}.entsize`) });
  }
  if (header.sectionNameTableIndex >= rawSections.length) {
    throw parseError(
      'ELF header.e_shstrndx',
      `index ${header.sectionNameTableIndex} is out of range`,
    );
  }
  const names = rawSections[header.sectionNameTableIndex];
  const namesOffset = asSafeNumber(names.offset, 'section name string table.offset');
  const namesSize = asSafeNumber(names.size, 'section name string table.size');
  requireRange(bytes, namesOffset, namesSize, 'section name string table');
  return rawSections.map((section, index) => {
    const nameOffset = asSafeNumber(section.nameOffset, `section headers[${index}].name`);
    if (nameOffset >= namesSize && nameOffset !== 0) {
      throw parseError(
        `section headers[${index}].name`,
        `offset ${nameOffset} is outside .shstrtab`,
      );
    }
    return {
      name: nameOffset === 0 ? '' : readString(
        bytes, namesOffset + nameOffset, namesSize - nameOffset,
        `section headers[${index}].name`,
      ),
      type: namedValue(SECTION_TYPE_NAMES, section.type),
      flags: sectionFlags(section.flags),
      addr: section.addr,
      offset: section.offset,
      size: section.size,
      link: section.link,
      info: section.info,
      addralign: section.addralign,
      entsize: section.entsize,
    };
  });
}

/**
 * Parses an ELF file's identification, header, program-header, and section-header
 * tables.
 * @param {ArrayBuffer|Uint8Array} input
 * @returns {{identification: object, header: object, programHeaders: object[],
 *   sectionHeaders: object[]}}
 * @throws {Error} If the supplied file is malformed or incomplete.
 */
export function parseElf(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  requireRange(bytes, 0, 16, 'ELF identification');
  if (!ELF_MAGIC.every((byte, index) => bytes[index] === byte)) {
    throw parseError('ELF identification.magic', 'expected 0x7f 45 4c 46');
  }
  const elfClass = bytes[4];
  const data = bytes[5];
  if (!CLASS_NAMES[elfClass]) {
    throw parseError('ELF identification.EI_CLASS', `unsupported value ${elfClass}`);
  }
  if (!DATA_NAMES[data]) {
    throw parseError('ELF identification.EI_DATA', `unsupported value ${data}`);
  }
  const is64 = elfClass === 2;
  const headerLength = is64 ? 64 : 52;
  requireRange(bytes, 0, headerLength, 'ELF header');
  const read = createReader(bytes, data === 1);
  const width = is64 ? 8 : 4;
  const header = {
    class: elfClass,
    type: read(16, 2, 'ELF header.e_type'),
    machine: read(18, 2, 'ELF header.e_machine'),
    version: read(20, 4, 'ELF header.e_version'), entry: read(24, width, 'ELF header.e_entry'),
    programHeaderOffset: read(24 + width, width, 'ELF header.e_phoff'),
    sectionHeaderOffset: read(24 + width * 2, width, 'ELF header.e_shoff'),
    flags: read(24 + width * 3, 4, 'ELF header.e_flags'),
    headerSize: read(28 + width * 3, 2, 'ELF header.e_ehsize'),
    programHeaderEntrySize: read(30 + width * 3, 2, 'ELF header.e_phentsize'),
    programHeaderCount: read(32 + width * 3, 2, 'ELF header.e_phnum'),
    sectionHeaderEntrySize: read(34 + width * 3, 2, 'ELF header.e_shentsize'),
    sectionHeaderCount: read(36 + width * 3, 2, 'ELF header.e_shnum'),
    sectionNameTableIndex: read(38 + width * 3, 2, 'ELF header.e_shstrndx'),
  };
  const identification = {
    magic: '0x7f 45 4c 46',
    class: CLASS_NAMES[elfClass],
    data: DATA_NAMES[data],
    version: namedValue(VERSION_NAMES, bytes[6]),
    osAbi: namedValue(OS_ABI_NAMES, bytes[7]),
    abiVersion: bytes[8],
  };
  return { identification, header: { ...header, type: namedValue(TYPE_NAMES, header.type),
    machine: namedValue(MACHINE_NAMES, header.machine), flags: formatHex(header.flags) },
  programHeaders: parseProgramHeaders(bytes, header, read),
  sectionHeaders: parseSectionHeaders(bytes, header, read) };
}
