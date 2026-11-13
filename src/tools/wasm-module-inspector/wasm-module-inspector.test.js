import { describe, expect, it } from 'vitest';
import { parseWasmModule } from './wasm-module-inspector.utils.js';

const header = [0, 0x61, 0x73, 0x6d, 1, 0, 0, 0];

describe('parseWasmModule', () => {
  it('parses a valid minimal module', () => {
    expect(parseWasmModule(new Uint8Array(header))).toEqual({ version: 1, sections: [] });
  });

  it('parses multiple section types including import and export entries', () => {
    const bytes = new Uint8Array([
      ...header,
      1, 1, 0,
      2, 7, 1, 1, 109, 1, 102, 0, 0,
      3, 2, 1, 0,
      7, 5, 1, 1, 102, 0, 0,
      10, 4, 1, 2, 0, 0x0b,
    ]);
    const result = parseWasmModule(bytes);
    expect(result.sections.map((section) => [section.name, section.count])).toEqual([
      ['Type', 0], ['Import', 1], ['Function', 1], ['Export', 1], ['Code', 1],
    ]);
    expect(result.sections[1].entries).toEqual([{ name: 'm.f', kind: 'function' }]);
    expect(result.sections[3].entries).toEqual([{ name: 'f', kind: 'function' }]);
  });

  it('rejects a truncated section payload', () => {
    expect(() => parseWasmModule(new Uint8Array([...header, 1, 3, 0]))).toThrow(/truncated section payload/);
  });

  it('rejects invalid magic numbers and unsupported versions', () => {
    expect(() => parseWasmModule(new Uint8Array([1, ...header.slice(1)]))).toThrow(/Not a WebAssembly/);
    expect(() => parseWasmModule(new Uint8Array([...header.slice(0, 4), 2, 0, 0, 0]))).toThrow(/Unsupported/);
  });

  it('rejects a malformed LEB128 section size', () => {
    expect(() => parseWasmModule(new Uint8Array([...header, 1, 0x80, 0x80, 0x80, 0x80, 0x80]))).toThrow(/malformed section size/);
  });
});
