const TAGS = {
  1: 'Utf8', 3: 'Integer', 4: 'Float', 5: 'Long', 6: 'Double', 7: 'Class',
  8: 'String', 9: 'Fieldref', 10: 'Methodref', 11: 'InterfaceMethodref',
  12: 'NameAndType', 15: 'MethodHandle', 16: 'MethodType', 17: 'Dynamic',
  18: 'InvokeDynamic', 19: 'Module', 20: 'Package',
};

const ACCESS_FLAGS = [
  [0x0001, 'public'], [0x0010, 'final'], [0x0020, 'super'], [0x0200, 'interface'],
  [0x0400, 'abstract'], [0x1000, 'synthetic'], [0x2000, 'annotation'], [0x4000, 'enum'],
  [0x8000, 'module'],
];

const JAVA_VERSIONS = {
  45: 'Java 1.1', 46: 'Java 1.2', 47: 'Java 1.3', 48: 'Java 1.4', 49: 'Java 5',
  50: 'Java 6', 51: 'Java 7', 52: 'Java 8', 53: 'Java 9', 54: 'Java 10',
  55: 'Java 11', 56: 'Java 12', 57: 'Java 13', 58: 'Java 14', 59: 'Java 15',
  60: 'Java 16', 61: 'Java 17', 62: 'Java 18', 63: 'Java 19', 64: 'Java 20',
  65: 'Java 21', 66: 'Java 22', 67: 'Java 23', 68: 'Java 24', 69: 'Java 25',
};

class ClassReader {
  constructor(bytes) {
    this.bytes = bytes;
    this.offset = 0;
  }

  require(length) {
    if (this.offset + length > this.bytes.length) {
      throw new Error('Truncated class file: the input ends before a complete structure.');
    }
  }

  u1() { this.require(1); return this.bytes[this.offset++]; }
  u2() { return (this.u1() << 8) | this.u1(); }
  u4() {
    return (this.u1() * 0x1000000) + (this.u1() << 16) + (this.u1() << 8) + this.u1();
  }

  take(length) {
    this.require(length);
    return this.bytes.slice(this.offset, this.offset += length);
  }
}

function parseConstantPool(reader, count) {
  const entries = new Array(count).fill(null);
  for (let index = 1; index < count; index += 1) {
    const tag = reader.u1();
    const name = TAGS[tag];
    if (!name) throw new Error(`Unsupported constant-pool tag ${tag} at entry #${index}.`);
    let value;
    switch (tag) {
      case 1:
        value = new TextDecoder('utf-8', { fatal: true }).decode(reader.take(reader.u2()));
        break;
      case 3: case 4: value = reader.u4(); break;
      case 5: case 6: value = `${reader.u4()}:${reader.u4()}`; index += 1; break;
      case 7: case 8: case 16: case 19: case 20: value = reader.u2(); break;
      case 9: case 10: case 11: case 12: case 17: case 18:
        value = [reader.u2(), reader.u2()];
        break;
      case 15: value = [reader.u1(), reader.u2()]; break;
      default: throw new Error(`Unsupported constant-pool tag ${tag}.`);
    }
    entries[index] = { index, tag, tagName: name, value };
  }
  return entries;
}

function resolveEntry(entries, index, seen = new Set()) {
  const entry = entries[index];
  if (!entry) return `#${index} (invalid)`;
  if (seen.has(index)) return `#${index}`;
  seen.add(index);
  if (entry.tag === 1) return entry.value;
  if ([7, 8, 16, 19, 20].includes(entry.tag)) {
    return resolveEntry(entries, entry.value, seen);
  }
  if (entry.tag === 12) {
    const name = resolveEntry(entries, entry.value[0], seen);
    const descriptor = resolveEntry(entries, entry.value[1], seen);
    return `${name}:${descriptor}`;
  }
  if ([9, 10, 11, 17, 18].includes(entry.tag)) {
    const owner = resolveEntry(entries, entry.value[0], seen);
    const member = resolveEntry(entries, entry.value[1], seen);
    return `${owner}.${member}`;
  }
  return String(entry.value);
}

function skipAttributes(reader, entries, collect = false) {
  const count = reader.u2();
  const attributes = [];
  for (let index = 0; index < count; index += 1) {
    const nameIndex = reader.u2();
    const length = reader.u4();
    const name = resolveEntry(entries, nameIndex);
    reader.take(length);
    if (collect) attributes.push({ name, length });
  }
  return { count, attributes };
}

function skipMembers(reader, entries) {
  const count = reader.u2();
  for (let index = 0; index < count; index += 1) {
    reader.u2();
    reader.u2();
    reader.u2();
    skipAttributes(reader, entries);
  }
  return count;
}

/**
 * Parses a JVM class-file byte sequence without executing or loading it.
 * @param {Uint8Array} bytes Raw class-file bytes.
 * @returns {object} Parsed class-file metadata.
 */
export function parseJavaClassFile(bytes) {
  if (!(bytes instanceof Uint8Array)) throw new TypeError('Input must be a Uint8Array.');
  const reader = new ClassReader(bytes);
  const magic = reader.u4();
  if (magic !== 0xcafebabe) {
    throw new Error('Invalid class file: expected magic number 0xCAFEBABE.');
  }
  const minorVersion = reader.u2();
  const majorVersion = reader.u2();
  const constantPoolCount = reader.u2();
  const constantPool = parseConstantPool(reader, constantPoolCount);
  const accessFlags = reader.u2();
  const thisClass = reader.u2();
  const superClass = reader.u2();
  const interfacesCount = reader.u2();
  for (let index = 0; index < interfacesCount; index += 1) reader.u2();
  const fieldsCount = skipMembers(reader, constantPool);
  const methodsCount = skipMembers(reader, constantPool);
  const { count: attributesCount, attributes } = skipAttributes(reader, constantPool, true);
  return {
    magic: '0xCAFEBABE', minorVersion, majorVersion,
    javaVersion: JAVA_VERSIONS[majorVersion] ?? `Unknown (major ${majorVersion})`,
    constantPoolCount, constantPool: constantPool.filter(Boolean).map((entry) => ({
      ...entry, resolvedValue: resolveEntry(constantPool, entry.index),
    })),
    accessFlags: ACCESS_FLAGS.filter(([bit]) => (accessFlags & bit) !== 0).map(([, name]) => name),
    thisClass: resolveEntry(constantPool, thisClass),
    superClass: superClass === 0 ? '(none)' : resolveEntry(constantPool, superClass),
    interfacesCount, fieldsCount, methodsCount, attributesCount, attributes,
  };
}

/** Converts a hexadecimal or Base64 paste into raw bytes. */
export function decodeClassInput(input) {
  const compact = input.replace(/\s/g, '').replace(/^0x/i, '');
  if (!compact) throw new Error('Paste hexadecimal or Base64 class-file data.');
  if (/^[0-9a-f]+$/i.test(compact)) {
    if (compact.length % 2) throw new Error('Hexadecimal input must contain complete byte pairs.');
    return Uint8Array.from(compact.match(/../g), (pair) => Number.parseInt(pair, 16));
  }
  try {
    return Uint8Array.from(atob(compact), (char) => char.charCodeAt(0));
  } catch {
    throw new Error('Input must be valid hexadecimal or Base64 data.');
  }
}
