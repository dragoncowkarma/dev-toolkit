import { describe, expect, it } from 'vitest';
import { createSampleClassFile, parseJavaClassHeader } from './javaClassParser.js';

function bytesToBuffer(bytes) {
  return new Uint8Array(bytes).buffer;
}

describe('parseJavaClassHeader', () => {
  it('parses the sample class header and resolves its names', () => {
    expect(parseJavaClassHeader(createSampleClassFile())).toMatchObject({
      magicNumber: '0xCAFEBABE',
      minorVersion: 0,
      majorVersion: 61,
      javaVersion: 'Java 17',
      constantPoolCount: 5,
      accessFlags: ['ACC_PUBLIC', 'ACC_SUPER'],
      thisClass: 2,
      superClass: 4,
      interfacesCount: 0,
      className: 'SampleClass',
      superClassName: 'java/lang/Object',
    });
  });

  it('rejects a file with a bad magic number', () => {
    expect(() => parseJavaClassHeader(bytesToBuffer([0, 0, 0, 0]))).toThrow(/magic number/i);
  });

  it('rejects a truncated header', () => {
    expect(() => parseJavaClassHeader(bytesToBuffer([0xca, 0xfe, 0xba, 0xbe]))).toThrow(
      /truncated/i
    );
  });

  it('rejects a truncated constant pool entry', () => {
    const bytes = [0xca, 0xfe, 0xba, 0xbe, 0, 0, 0, 0x3d, 0, 2, 1, 0, 4, 0x41];
    expect(() => parseJavaClassHeader(bytesToBuffer(bytes))).toThrow(/truncated/i);
  });

  it('rejects an out-of-range this_class index', () => {
    const bytes = new Uint8Array(createSampleClassFile());
    bytes[51] = 0;
    bytes[52] = 9;
    expect(() => parseJavaClassHeader(bytes.buffer)).toThrow(/this_class.*invalid/i);
  });
});
