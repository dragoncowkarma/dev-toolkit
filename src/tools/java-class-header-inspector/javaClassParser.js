const CLASS_MAGIC = 0xcafebabe;

const ACCESS_FLAGS = [
  [0x0001, 'ACC_PUBLIC'],
  [0x0010, 'ACC_FINAL'],
  [0x0020, 'ACC_SUPER'],
  [0x0200, 'ACC_INTERFACE'],
  [0x0400, 'ACC_ABSTRACT'],
  [0x1000, 'ACC_SYNTHETIC'],
  [0x2000, 'ACC_ANNOTATION'],
  [0x4000, 'ACC_ENUM'],
  [0x8000, 'ACC_MODULE'],
];

const JAVA_VERSIONS = {
  45: 'Java 1.1',
  46: 'Java 1.2',
  47: 'Java 1.3',
  48: 'Java 1.4',
  49: 'Java 5',
  50: 'Java 6',
  51: 'Java 7',
  52: 'Java 8',
  53: 'Java 9',
  54: 'Java 10',
  55: 'Java 11',
  56: 'Java 12',
  57: 'Java 13',
  58: 'Java 14',
  59: 'Java 15',
  60: 'Java 16',
  61: 'Java 17',
  62: 'Java 18',
  63: 'Java 19',
  64: 'Java 20',
  65: 'Java 21',
  66: 'Java 22',
  67: 'Java 23',
  68: 'Java 24',
  69: 'Java 25',
};

class ClassFileReader {
  constructor(buffer) {
    if (!(buffer instanceof ArrayBuffer)) {
      throw new Error('Expected a binary class file.');
    }
    this.view = new DataView(buffer);
    this.offset = 0;
  }

  ensure(bytes) {
    if (this.offset + bytes > this.view.byteLength) {
      throw new Error('The class file is truncated.');
    }
  }

  readU1() {
    this.ensure(1);
    const value = this.view.getUint8(this.offset);
    this.offset += 1;
    return value;
  }

  readU2() {
    this.ensure(2);
    const value = this.view.getUint16(this.offset, false);
    this.offset += 2;
    return value;
  }

  readU4() {
    this.ensure(4);
    const value = this.view.getUint32(this.offset, false);
    this.offset += 4;
    return value;
  }

  readBytes(length) {
    this.ensure(length);
    const bytes = new Uint8Array(this.view.buffer, this.offset, length);
    this.offset += length;
    return bytes;
  }
}

function decodeUtf8(bytes) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error('The constant pool contains invalid UTF-8 text.');
  }
}

function readConstantPool(reader, count) {
  if (count === 0) {
    throw new Error('The constant pool count must be at least 1.');
  }
  const entries = new Array(count).fill(null);
  for (let index = 1; index < count; index += 1) {
    const tag = reader.readU1();
    if (tag === 1) {
      entries[index] = { tag, value: decodeUtf8(reader.readBytes(reader.readU2())) };
    } else if (tag === 7) {
      entries[index] = { tag, nameIndex: reader.readU2() };
    } else if ([3, 4].includes(tag)) {
      reader.readU4();
    } else if ([5, 6].includes(tag)) {
      reader.readU4();
      reader.readU4();
      index += 1;
      if (index >= count) {
        throw new Error('A long or double constant pool entry is incomplete.');
      }
    } else if ([8, 16, 19, 20].includes(tag)) {
      reader.readU2();
    } else if (tag === 15) {
      reader.readU1();
      reader.readU2();
    } else if ([9, 10, 11, 12, 17, 18].includes(tag)) {
      reader.readU2();
      reader.readU2();
    } else {
      throw new Error(`Unsupported or invalid constant pool tag: ${tag}.`);
    }
  }
  return entries;
}

function className(entries, index, label, allowZero = false) {
  if (index === 0 && allowZero) return 'None';
  const classEntry = entries[index];
  if (!classEntry || classEntry.tag !== 7) {
    throw new Error(`${label} references an invalid constant pool index.`);
  }
  const nameEntry = entries[classEntry.nameIndex];
  if (!nameEntry || nameEntry.tag !== 1) {
    throw new Error(`${label} references an invalid class name.`);
  }
  return nameEntry.value;
}

/**
 * Parses the header and constant-pool references needed to identify a Java class file.
 *
 * @param {ArrayBuffer} buffer - Raw bytes from a .class file.
 * @returns {object} Parsed class header fields.
 * @throws {Error} When the file is malformed or incomplete.
 */
export function parseJavaClassHeader(buffer) {
  const reader = new ClassFileReader(buffer);
  if (reader.readU4() !== CLASS_MAGIC) {
    throw new Error('Invalid Java class file magic number. Expected 0xCAFEBABE.');
  }
  const minorVersion = reader.readU2();
  const majorVersion = reader.readU2();
  const constantPoolCount = reader.readU2();
  const entries = readConstantPool(reader, constantPoolCount);
  const accessFlags = reader.readU2();
  const thisClass = reader.readU2();
  const superClass = reader.readU2();
  const interfacesCount = reader.readU2();
  const interfaceNames = [];
  for (let index = 0; index < interfacesCount; index += 1) {
    interfaceNames.push(className(entries, reader.readU2(), 'An interface'));
  }

  return {
    magicNumber: '0xCAFEBABE',
    minorVersion,
    majorVersion,
    javaVersion: JAVA_VERSIONS[majorVersion] ?? 'Unknown Java version',
    constantPoolCount,
    accessFlags: ACCESS_FLAGS.filter(([flag]) => accessFlags & flag).map(([, name]) => name),
    thisClass,
    superClass,
    interfacesCount,
    className: className(entries, thisClass, 'this_class'),
    superClassName: className(entries, superClass, 'super_class', true),
    interfaceNames,
  };
}

/**
 * Creates a small valid Java 17 class header fixture for the in-browser demo.
 *
 * @returns {ArrayBuffer} A minimal SampleClass .class file header.
 */
export function createSampleClassFile() {
  const bytes = [
    0xca, 0xfe, 0xba, 0xbe, 0x00, 0x00, 0x00, 0x3d, 0x00, 0x05,
    0x01, 0x00, 0x0b, ...new TextEncoder().encode('SampleClass'),
    0x07, 0x00, 0x01, 0x01, 0x00, 0x10,
    ...new TextEncoder().encode('java/lang/Object'), 0x07, 0x00, 0x03,
    0x00, 0x21, 0x00, 0x02, 0x00, 0x04, 0x00, 0x00,
  ];
  return new Uint8Array(bytes).buffer;
}
