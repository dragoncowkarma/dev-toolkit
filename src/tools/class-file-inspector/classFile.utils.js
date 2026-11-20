const MAGIC = 0xcafebabe;

const CONSTANT_TAGS = {
  1: "Utf8",
  3: "Integer",
  4: "Float",
  5: "Long",
  6: "Double",
  7: "Class",
  8: "String",
  9: "Fieldref",
  10: "Methodref",
  11: "InterfaceMethodref",
  12: "NameAndType",
  15: "MethodHandle",
  16: "MethodType",
  17: "Dynamic",
  18: "InvokeDynamic",
  19: "Module",
  20: "Package",
};

const CLASS_ACCESS_FLAGS = [
  [0x0001, "public"],
  [0x0010, "final"],
  [0x0020, "super"],
  [0x0200, "interface"],
  [0x0400, "abstract"],
  [0x1000, "synthetic"],
  [0x2000, "annotation"],
  [0x4000, "enum"],
  [0x8000, "module"],
];

const MEMBER_ACCESS_FLAGS = [
  [0x0001, "public"],
  [0x0002, "private"],
  [0x0004, "protected"],
  [0x0008, "static"],
  [0x0010, "final"],
  [0x0020, "synchronized"],
  [0x0040, "bridge"],
  [0x0080, "varargs"],
  [0x0100, "native"],
  [0x0400, "abstract"],
  [0x0800, "strict"],
  [0x1000, "synthetic"],
];

const JDK_RELEASES = {
  45: "Java 1.1",
  46: "Java 1.2",
  47: "Java 1.3",
  48: "Java 1.4",
  49: "Java 5",
  50: "Java 6",
  51: "Java 7",
  52: "Java 8",
  53: "Java 9",
  54: "Java 10",
  55: "Java 11",
  56: "Java 12",
  57: "Java 13",
  58: "Java 14",
  59: "Java 15",
  60: "Java 16",
  61: "Java 17",
  62: "Java 18",
  63: "Java 19",
  64: "Java 20",
  65: "Java 21",
  66: "Java 22",
  67: "Java 23",
  68: "Java 24",
  69: "Java 25",
  70: "Java 26",
};

class ClassFileReader {
  constructor(buffer) {
    this.view = new DataView(buffer);
    this.offset = 0;
  }

  require(bytes, label) {
    if (bytes > this.view.byteLength - this.offset) {
      throw new Error(
        `Truncated class file: ${label} needs ${bytes} byte(s) at offset ${this.offset}.`,
      );
    }
  }

  u1(label) {
    this.require(1, label);
    const value = this.view.getUint8(this.offset);
    this.offset += 1;
    return value;
  }

  u2(label) {
    this.require(2, label);
    const value = this.view.getUint16(this.offset);
    this.offset += 2;
    return value;
  }

  u4(label) {
    this.require(4, label);
    const value = this.view.getUint32(this.offset);
    this.offset += 4;
    return value;
  }

  bytes(length, label) {
    this.require(length, label);
    const result = new Uint8Array(
      this.view.buffer,
      this.view.byteOffset + this.offset,
      length,
    );
    this.offset += length;
    return result;
  }
}

function flagsFrom(value, definitions) {
  return definitions
    .filter(([bit]) => (value & bit) !== 0)
    .map(([, name]) => name);
}

function entryAt(pool, index, expectedType) {
  const entry = pool[index];
  if (!entry || (expectedType && entry.type !== expectedType)) {
    throw new Error(
      `Malformed class file: invalid ${expectedType ?? "constant pool"} index ${index}.`,
    );
  }
  return entry;
}

function resolveUtf8(pool, index) {
  return entryAt(pool, index, "Utf8").value;
}

function resolveClassName(pool, index) {
  return resolveUtf8(pool, entryAt(pool, index, "Class").nameIndex);
}

function resolveNameAndType(pool, index) {
  const entry = entryAt(pool, index, "NameAndType");
  return `${resolveUtf8(pool, entry.nameIndex)}:${resolveUtf8(pool, entry.descriptorIndex)}`;
}

function describeEntry(pool, entry) {
  switch (entry.type) {
    case "Utf8":
      return entry.value;
    case "Integer":
      return String(entry.value);
    case "Float":
    case "Long":
    case "Double":
      return String(entry.value);
    case "Class":
      return resolveUtf8(pool, entry.nameIndex);
    case "String":
      return `"${resolveUtf8(pool, entry.index)}"`;
    case "NameAndType":
      return `${resolveUtf8(pool, entry.nameIndex)}:${resolveUtf8(pool, entry.descriptorIndex)}`;
    case "Fieldref":
    case "Methodref":
    case "InterfaceMethodref":
      return `${resolveClassName(pool, entry.classIndex)}.${resolveNameAndType(
        pool,
        entry.nameAndTypeIndex,
      )}`;
    case "MethodType":
      return resolveUtf8(pool, entry.descriptorIndex);
    case "Module":
    case "Package":
      return resolveUtf8(pool, entry.nameIndex);
    case "MethodHandle":
      return `kind ${entry.referenceKind}, #${entry.referenceIndex}`;
    case "Dynamic":
    case "InvokeDynamic":
      return `bootstrap #${entry.bootstrapIndex}, ${resolveNameAndType(
        pool,
        entry.nameAndTypeIndex,
      )}`;
    default:
      return "";
  }
}

function parseConstantPool(reader, count) {
  const pool = new Array(count);
  for (let index = 1; index < count; index += 1) {
    const tag = reader.u1(`constant pool tag #${index}`);
    const type = CONSTANT_TAGS[tag];
    if (!type)
      throw new Error(
        `Malformed class file: unsupported constant pool tag ${tag} at index ${index}.`,
      );
    let entry;
    if (tag === 1) {
      const length = reader.u2(`UTF-8 length #${index}`);
      entry = {
        type,
        value: new TextDecoder("utf-8", { fatal: false }).decode(
          reader.bytes(length, `UTF-8 data #${index}`),
        ),
      };
    } else if (tag === 3)
      entry = { type, value: reader.u4(`integer #${index}`) | 0 };
    else if (tag === 4) {
      reader.require(4, `float #${index}`);
      entry = { type, value: reader.view.getFloat32(reader.offset) };
      reader.offset += 4;
    } else if (tag === 5 || tag === 6) {
      reader.require(8, `${type.toLowerCase()} #${index}`);
      const value =
        tag === 5
          ? reader.view.getBigInt64(reader.offset)
          : reader.view.getFloat64(reader.offset);
      reader.offset += 8;
      entry = { type, value };
      pool[index] = entry;
      index += 1;
      continue;
    } else if (tag === 7) {
      entry = { type, nameIndex: reader.u2(`Class name index #${index}`) };
    } else if (tag === 8) {
      entry = { type, index: reader.u2(`String index #${index}`) };
    } else if (tag === 16) {
      entry = {
        type,
        descriptorIndex: reader.u2(`MethodType index #${index}`),
      };
    } else if (tag === 12)
      entry = {
        type,
        nameIndex: reader.u2(`name index #${index}`),
        descriptorIndex: reader.u2(`descriptor index #${index}`),
      };
    else if (tag === 9 || tag === 10 || tag === 11)
      entry = {
        type,
        classIndex: reader.u2(`class index #${index}`),
        nameAndTypeIndex: reader.u2(`name and type index #${index}`),
      };
    else if (tag === 15)
      entry = {
        type,
        referenceKind: reader.u1(`reference kind #${index}`),
        referenceIndex: reader.u2(`reference index #${index}`),
      };
    else if (tag === 17 || tag === 18)
      entry = {
        type,
        bootstrapIndex: reader.u2(`bootstrap index #${index}`),
        nameAndTypeIndex: reader.u2(`name and type index #${index}`),
      };
    else entry = { type, nameIndex: reader.u2(`${type} name index #${index}`) };
    pool[index] = entry;
  }
  return pool;
}

function parseAttributes(reader, pool, context) {
  const count = reader.u2(`${context} attributes count`);
  const attributes = [];
  for (let index = 0; index < count; index += 1) {
    const name = resolveUtf8(
      pool,
      reader.u2(`${context} attribute name index`),
    );
    const length = reader.u4(`${context} attribute length`);
    reader.bytes(length, `${context} attribute ${name}`);
    attributes.push(name);
  }
  return attributes;
}

function parseMembers(reader, pool, context) {
  const count = reader.u2(`${context} count`);
  const members = [];
  for (let index = 0; index < count; index += 1) {
    const access = reader.u2(`${context} access flags`);
    const name = resolveUtf8(pool, reader.u2(`${context} name index`));
    const descriptor = resolveUtf8(
      pool,
      reader.u2(`${context} descriptor index`),
    );
    parseAttributes(reader, pool, `${context} ${name}`);
    members.push({
      name,
      descriptor,
      flags: flagsFrom(access, MEMBER_ACCESS_FLAGS),
    });
  }
  return members;
}

/**
 * Parses a JVM class-file buffer without sending it anywhere.
 * @param {ArrayBuffer} buffer
 * @returns {object} Parsed header, pool, class, member, and attribute data.
 */
export function parseClassFile(buffer) {
  if (!(buffer instanceof ArrayBuffer))
    throw new TypeError("A class file ArrayBuffer is required.");
  const reader = new ClassFileReader(buffer);
  const magic = reader.u4("magic number");
  if (magic !== MAGIC) {
    const foundMagic = magic.toString(16).padStart(8, "0").toUpperCase();
    throw new Error(
      `Invalid class file magic number: expected 0xCAFEBABE, found 0x${foundMagic}.`,
    );
  }
  const minorVersion = reader.u2("minor version");
  const majorVersion = reader.u2("major version");
  const constantPoolCount = reader.u2("constant pool count");
  if (constantPoolCount === 0)
    throw new Error(
      "Malformed class file: constant pool count must be at least 1.",
    );
  const pool = parseConstantPool(reader, constantPoolCount);
  const access = reader.u2("class access flags");
  const thisClass = reader.u2("this class index");
  const superClass = reader.u2("super class index");
  const interfaceCount = reader.u2("interfaces count");
  const interfaces = Array.from({ length: interfaceCount }, () =>
    resolveClassName(pool, reader.u2("interface index")),
  );
  const fields = parseMembers(reader, pool, "field");
  const methods = parseMembers(reader, pool, "method");
  const attributes = parseAttributes(reader, pool, "class");
  const constantPool = pool
    .map(
      (entry, index) =>
        entry && { index, type: entry.type, value: describeEntry(pool, entry) },
    )
    .filter(Boolean);
  return {
    magic: "0xCAFEBABE",
    minorVersion,
    majorVersion,
    jdkRelease: JDK_RELEASES[majorVersion] ?? "Unknown JDK release",
    constantPoolCount,
    constantPool,
    flags: flagsFrom(access, CLASS_ACCESS_FLAGS),
    thisClass: resolveClassName(pool, thisClass),
    superClass: superClass === 0 ? null : resolveClassName(pool, superClass),
    interfaces,
    fields,
    methods,
    attributes,
  };
}

/**
 * Reads and parses a class File locally using its ArrayBuffer.
 * @param {File} file
 * @returns {Promise<object>} Parsed class-file data.
 */
export async function inspectClassFile(file) {
  return parseClassFile(await file.arrayBuffer());
}
