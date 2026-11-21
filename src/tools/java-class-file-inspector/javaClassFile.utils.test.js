import { describe, expect, it } from 'vitest';
import { decodeClassInput, parseJavaClassFile } from './javaClassFile.utils.js';

const minimalClass = Uint8Array.from([
  0xca, 0xfe, 0xba, 0xbe, 0, 0, 0, 0x3d, 0, 5,
  1, 0, 4, 0x54, 0x65, 0x73, 0x74, 7, 0, 1,
  1, 0, 0x10, ...new TextEncoder().encode('java/lang/Object'), 7, 0, 3,
  0, 0x21, 0, 2, 0, 4, 0, 0, 0, 0, 0, 0, 0, 0,
]);

// Fixture contains the entry types emitted for a class constructor reference.
const compiledClassFixture = Uint8Array.from([
  0xca, 0xfe, 0xba, 0xbe, 0, 0, 0, 0x41, 0, 9,
  1, 0, 6, ...new TextEncoder().encode('Sample'), 7, 0, 1,
  1, 0, 0x10, ...new TextEncoder().encode('java/lang/Object'), 7, 0, 3,
  1, 0, 6, ...new TextEncoder().encode('<init>'), 1, 0, 3, 0x28, 0x29, 0x56,
  12, 0, 5, 0, 6, 10, 0, 4, 0, 7,
  0, 0x21, 0, 2, 0, 4, 0, 0, 0, 0, 0, 0, 0, 0,
]);

describe('parseJavaClassFile', () => {
  it('parses a valid minimal class file', () => {
    const result = parseJavaClassFile(minimalClass);
    expect(result).toMatchObject({ majorVersion: 61, javaVersion: 'Java 17', thisClass: 'Test' });
  });

  it('rejects a bad magic number', () => {
    expect(() => parseJavaClassFile(Uint8Array.of(0, 0, 0, 0))).toThrow(/magic number/);
  });

  it('rejects a truncated buffer', () => {
    expect(() => parseJavaClassFile(minimalClass.slice(0, 12))).toThrow(/Truncated/);
  });

  it('inspects a compiled class fixture with a non-trivial constant pool', () => {
    const result = parseJavaClassFile(compiledClassFixture);
    expect(result.constantPool).toHaveLength(8);
    expect(result.constantPool.map((entry) => entry.tagName)).toContain('Methodref');
    expect(result.constantPool.find((entry) => entry.tagName === 'Methodref').resolvedValue)
      .toContain('java/lang/Object.<init>:()V');
  });
});

describe('decodeClassInput', () => {
  it('accepts hexadecimal and Base64 input', () => {
    expect(decodeClassInput('CA FE BA BE')).toEqual(Uint8Array.of(0xca, 0xfe, 0xba, 0xbe));
    expect(decodeClassInput('yv66vg==')).toEqual(Uint8Array.of(0xca, 0xfe, 0xba, 0xbe));
  });
});
