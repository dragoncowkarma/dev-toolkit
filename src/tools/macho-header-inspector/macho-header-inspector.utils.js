const MH_MAGIC = 0xfeedface;
const MH_CIGAM = 0xcefaedfe;
const MH_MAGIC_64 = 0xfeedfacf;
const MH_CIGAM_64 = 0xcffaedfe;
const FAT_MAGIC = 0xcafebabe;
const FAT_CIGAM = 0xbebafeca;

const CPU_NAMES = new Map([
  [7, "x86"],
  [0x01000007, "x86_64"],
  [12, "arm"],
  [0x0100000c, "arm64"],
  [18, "ppc"],
  [0x01000012, "ppc64"],
]);

const FILE_TYPES = new Map([
  [1, "MH_OBJECT"],
  [2, "MH_EXECUTE"],
  [3, "MH_FVMLIB"],
  [4, "MH_CORE"],
  [5, "MH_PRELOAD"],
  [6, "MH_DYLIB"],
  [7, "MH_DYLINKER"],
  [8, "MH_BUNDLE"],
  [9, "MH_DYLIB_STUB"],
  [10, "MH_DSYM"],
  [11, "MH_KEXT_BUNDLE"],
]);

const FLAGS = [
  [0x1, "MH_NOUNDEFS"],
  [0x2, "MH_INCRLINK"],
  [0x4, "MH_DYLDLINK"],
  [0x8, "MH_BINDATLOAD"],
  [0x10, "MH_PREBOUND"],
  [0x20, "MH_SPLIT_SEGS"],
  [0x40, "MH_LAZY_INIT"],
  [0x80, "MH_TWOLEVEL"],
  [0x100, "MH_FORCE_FLAT"],
  [0x200, "MH_NOMULTIDEFS"],
  [0x400, "MH_NOFIXPREBINDING"],
  [0x800, "MH_PREBINDABLE"],
  [0x1000, "MH_ALLMODSBOUND"],
  [0x2000, "MH_SUBSECTIONS_VIA_SYMBOLS"],
  [0x4000, "MH_CANONICAL"],
  [0x8000, "MH_WEAK_DEFINES"],
  [0x10000, "MH_BINDS_TO_WEAK"],
  [0x20000, "MH_ALLOW_STACK_EXECUTION"],
  [0x40000, "MH_ROOT_SAFE"],
  [0x80000, "MH_SETUID_SAFE"],
  [0x100000, "MH_NO_REEXPORTED_DYLIBS"],
  [0x200000, "MH_PIE"],
  [0x400000, "MH_DEAD_STRIPPABLE_DYLIB"],
  [0x800000, "MH_HAS_TLV_DESCRIPTORS"],
  [0x1000000, "MH_NO_HEAP_EXECUTION"],
  [0x2000000, "MH_APP_EXTENSION_SAFE"],
];

const COMMAND_NAMES = new Map([
  [0x1, "LC_SEGMENT"],
  [0x2, "LC_SYMTAB"],
  [0xc, "LC_LOAD_DYLIB"],
  [0x80000018, "LC_LOAD_WEAK_DYLIB"],
  [0x19, "LC_SEGMENT_64"],
  [0x22, "LC_DYLD_INFO"],
  [0x80000022, "LC_DYLD_INFO_ONLY"],
]);

/** Error returned when a binary cannot be safely parsed as Mach-O. */
export class MachOParseError extends Error {
  constructor(message) {
    super(message);
    this.name = "MachOParseError";
  }
}

function requireRange(start, size, end, context) {
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(size) ||
    start < 0 ||
    size < 0 ||
    start > end ||
    size > end - start
  ) {
    throw new MachOParseError(
      `${context} is truncated or extends beyond the file.`,
    );
  }
}

function readFixedString(bytes, offset, length) {
  const slice = bytes.subarray(offset, offset + length);
  const nulIndex = slice.indexOf(0);
  return new TextDecoder().decode(
    nulIndex === -1 ? slice : slice.subarray(0, nulIndex),
  );
}

function versionString(value) {
  return `${value >>> 16}.${(value >>> 8) & 0xff}.${value & 0xff}`;
}

function commandName(command) {
  return COMMAND_NAMES.get(command) ?? `LC_UNKNOWN (0x${command.toString(16)})`;
}

function cpuName(type, subtype) {
  const name = CPU_NAMES.get(type) ?? `CPU_TYPE_0x${type.toString(16)}`;
  return subtype === 0 ? name : `${name} (subtype ${subtype})`;
}

function validateFileRange(offset, size, imageLength, context) {
  if (offset > imageLength || size > imageLength - offset) {
    throw new MachOParseError(
      `${context} declares bytes outside its Mach-O image.`,
    );
  }
}

function parseSegment(
  view,
  bytes,
  offset,
  commandSize,
  is64,
  littleEndian,
  imageLength,
) {
  const fixedSize = is64 ? 72 : 56;
  const sectionSize = is64 ? 80 : 68;
  if (commandSize < fixedSize)
    throw new MachOParseError("Segment load command is too small.");
  const name = readFixedString(bytes, offset + 8, 16) || "(unnamed)";
  const vmAddress = is64
    ? view.getBigUint64(offset + 24, littleEndian)
    : BigInt(view.getUint32(offset + 24, littleEndian));
  const vmSize = is64
    ? view.getBigUint64(offset + 32, littleEndian)
    : BigInt(view.getUint32(offset + 28, littleEndian));
  const fileOffset = is64
    ? view.getBigUint64(offset + 40, littleEndian)
    : BigInt(view.getUint32(offset + 32, littleEndian));
  const fileSize = is64
    ? view.getBigUint64(offset + 48, littleEndian)
    : BigInt(view.getUint32(offset + 36, littleEndian));
  const sectionCount = view.getUint32(offset + (is64 ? 64 : 48), littleEndian);
  if (sectionCount > Math.floor((commandSize - fixedSize) / sectionSize)) {
    throw new MachOParseError(
      "Segment declares more sections than fit in its load command.",
    );
  }
  if (
    fileOffset > BigInt(Number.MAX_SAFE_INTEGER) ||
    fileSize > BigInt(Number.MAX_SAFE_INTEGER)
  ) {
    throw new MachOParseError(
      "Segment file range is too large for browser-safe inspection.",
    );
  }
  validateFileRange(
    Number(fileOffset),
    Number(fileSize),
    imageLength,
    `Segment ${name}`,
  );
  const sections = [];
  for (let index = 0; index < sectionCount; index += 1) {
    const sectionOffset = offset + fixedSize + index * sectionSize;
    const sectionName =
      readFixedString(bytes, sectionOffset, 16) || "(unnamed)";
    const sectionAddress = is64
      ? view.getBigUint64(sectionOffset + 32, littleEndian)
      : BigInt(view.getUint32(sectionOffset + 32, littleEndian));
    const sectionSizeValue = is64
      ? view.getBigUint64(sectionOffset + 40, littleEndian)
      : BigInt(view.getUint32(sectionOffset + 36, littleEndian));
    const sectionFileOffset = view.getUint32(
      sectionOffset + (is64 ? 48 : 40),
      littleEndian,
    );
    const sectionFlags = view.getUint32(
      sectionOffset + (is64 ? 64 : 56),
      littleEndian,
    );
    const sectionType = sectionFlags & 0xff;
    if (
      sectionType !== 1 &&
      sectionType !== 0x12 &&
      sectionSizeValue <= BigInt(Number.MAX_SAFE_INTEGER)
    ) {
      validateFileRange(
        sectionFileOffset,
        Number(sectionSizeValue),
        imageLength,
        `Section ${sectionName}`,
      );
    }
    sections.push({
      name: sectionName,
      address: sectionAddress,
      size: sectionSizeValue,
    });
  }
  return { name, vmAddress, vmSize, fileOffset, fileSize, sections };
}

function parseDylib(view, bytes, offset, commandSize, littleEndian) {
  if (commandSize < 24)
    throw new MachOParseError("Dylib load command is too small.");
  const pathOffset = view.getUint32(offset + 8, littleEndian);
  if (pathOffset < 24 || pathOffset >= commandSize) {
    throw new MachOParseError("Dylib path offset is outside its load command.");
  }
  const pathBytes = bytes.subarray(offset + pathOffset, offset + commandSize);
  const nulIndex = pathBytes.indexOf(0);
  if (nulIndex === -1)
    throw new MachOParseError("Dylib path is not NUL-terminated.");
  return {
    path: new TextDecoder().decode(pathBytes.subarray(0, nulIndex)),
    timestamp: view.getUint32(offset + 12, littleEndian),
    currentVersion: versionString(view.getUint32(offset + 16, littleEndian)),
    compatibilityVersion: versionString(
      view.getUint32(offset + 20, littleEndian),
    ),
  };
}

function parseMachHeader(bytes, baseOffset, imageEnd) {
  requireRange(baseOffset, 4, imageEnd, "Mach-O magic");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const rawMagic = view.getUint32(baseOffset, false);
  const magic = new Map([
    [MH_MAGIC, { is64: false, littleEndian: false, label: "MH_MAGIC" }],
    [MH_CIGAM, { is64: false, littleEndian: true, label: "MH_CIGAM" }],
    [MH_MAGIC_64, { is64: true, littleEndian: false, label: "MH_MAGIC_64" }],
    [MH_CIGAM_64, { is64: true, littleEndian: true, label: "MH_CIGAM_64" }],
  ]).get(rawMagic);
  if (!magic)
    throw new MachOParseError(
      "File does not start with a supported Mach-O magic number.",
    );
  const headerSize = magic.is64 ? 32 : 28;
  requireRange(baseOffset, headerSize, imageEnd, "Mach-O header");
  const cpuType = view.getUint32(baseOffset + 4, magic.littleEndian);
  const cpuSubtype =
    view.getUint32(baseOffset + 8, magic.littleEndian) & 0x00ffffff;
  const fileTypeValue = view.getUint32(baseOffset + 12, magic.littleEndian);
  const commandCount = view.getUint32(baseOffset + 16, magic.littleEndian);
  const commandsSize = view.getUint32(baseOffset + 20, magic.littleEndian);
  const flagsValue = view.getUint32(baseOffset + 24, magic.littleEndian);
  const commandsStart = baseOffset + headerSize;
  requireRange(
    commandsStart,
    commandsSize,
    imageEnd,
    "Mach-O load command table",
  );
  if (commandCount > Math.floor(commandsSize / 8)) {
    throw new MachOParseError(
      "Mach-O header declares more load commands than can fit.",
    );
  }
  const commandsEnd = commandsStart + commandsSize;
  const commands = [];
  let cursor = commandsStart;
  for (let index = 0; index < commandCount; index += 1) {
    requireRange(cursor, 8, commandsEnd, `Load command ${index + 1}`);
    const typeValue = view.getUint32(cursor, magic.littleEndian);
    const size = view.getUint32(cursor + 4, magic.littleEndian);
    if (size < 8 || size > commandsEnd - cursor) {
      throw new MachOParseError(
        `Load command ${index + 1} has an invalid size.`,
      );
    }
    const command = { type: commandName(typeValue), size };
    const imageLength = imageEnd - baseOffset;
    if (typeValue === 0x1 || typeValue === 0x19) {
      command.segment = parseSegment(
        view,
        bytes,
        cursor,
        size,
        typeValue === 0x19,
        magic.littleEndian,
        imageLength,
      );
    } else if (typeValue === 0xc || typeValue === 0x80000018) {
      command.dylib = parseDylib(view, bytes, cursor, size, magic.littleEndian);
    }
    commands.push(command);
    cursor += size;
  }
  return {
    magic: magic.label,
    is64Bit: magic.is64,
    endianness: magic.littleEndian ? "Little-endian" : "Big-endian",
    cpu: cpuName(cpuType, cpuSubtype),
    fileType: FILE_TYPES.get(fileTypeValue) ?? `MH_UNKNOWN (${fileTypeValue})`,
    commandCount,
    commandsSize,
    flags: FLAGS.filter(([bit]) => (flagsValue & bit) !== 0).map(
      ([, name]) => name,
    ),
    commands,
  };
}

/**
 * Parses a Mach-O thin or FAT/universal binary without network or runtime APIs.
 *
 * @param {ArrayBuffer} buffer Binary file content.
 * @returns {{isUniversal: boolean, architectures: Array<object>}} Parsed Mach-O images.
 */
export function inspectMachO(buffer) {
  const bytes = new Uint8Array(buffer);
  requireRange(0, 4, bytes.length, "File");
  const view = new DataView(buffer);
  const magic = view.getUint32(0, false);
  if (magic !== FAT_MAGIC && magic !== FAT_CIGAM) {
    return {
      isUniversal: false,
      architectures: [parseMachHeader(bytes, 0, bytes.length)],
    };
  }
  const littleEndian = magic === FAT_CIGAM;
  requireRange(0, 8, bytes.length, "FAT header");
  const count = view.getUint32(4, littleEndian);
  if (count > Math.floor((bytes.length - 8) / 20)) {
    throw new MachOParseError(
      "FAT header declares more architectures than fit in the file.",
    );
  }
  const architectures = [];
  for (let index = 0; index < count; index += 1) {
    const entry = 8 + index * 20;
    const offset = view.getUint32(entry + 8, littleEndian);
    const size = view.getUint32(entry + 12, littleEndian);
    validateFileRange(
      offset,
      size,
      bytes.length,
      `FAT architecture ${index + 1}`,
    );
    const header = parseMachHeader(bytes, offset, offset + size);
    architectures.push({
      ...header,
      fatCpu: cpuName(
        view.getUint32(entry, littleEndian),
        view.getUint32(entry + 4, littleEndian) & 0x00ffffff,
      ),
    });
  }
  return { isUniversal: true, architectures };
}

/**
 * Formats a numeric address or size as a hexadecimal value for the inspector UI.
 * @param {number | bigint} value Numeric binary value.
 * @returns {string} Hexadecimal representation.
 */
export function formatHex(value) {
  return `0x${value.toString(16).toUpperCase()}`;
}
