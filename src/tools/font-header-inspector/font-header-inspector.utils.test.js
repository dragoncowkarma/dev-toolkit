import { describe, expect, it } from "vitest";
import { inspectFontHeader } from "./font-header-inspector.utils.js";

function bytes(length) {
  return new Uint8Array(length);
}

function writeTag(target, offset, tag) {
  [...tag].forEach((character, index) => {
    target[offset + index] = character.charCodeAt(0);
  });
}

function viewFor(target) {
  return new DataView(target.buffer);
}

function sfnt(signature = "\u0000\u0001\u0000\u0000") {
  const target = bytes(64);
  const view = viewFor(target);
  writeTag(target, 0, signature);
  view.setUint16(4, 1);
  view.setUint16(6, 16);
  view.setUint16(8, 0);
  view.setUint16(10, 0);
  writeTag(target, 12, "head");
  view.setUint32(16, 0x12345678);
  view.setUint32(20, 32);
  view.setUint32(24, 16);
  return target;
}

function woff(signature = "wOFF", length = 80) {
  const target = bytes(80);
  const view = viewFor(target);
  writeTag(target, 0, signature);
  writeTag(target, 4, "OTTO");
  view.setUint32(8, length);
  view.setUint16(12, 1);
  view.setUint32(16, 96);
  view.setUint16(20, 1);
  view.setUint16(22, 2);
  writeTag(target, 44, "cmap");
  view.setUint32(48, 64);
  view.setUint32(52, 8);
  view.setUint32(56, 12);
  view.setUint32(60, 0xaabbccdd);
  return target;
}

function woff2(signature = "wOF2", length = 50) {
  const target = bytes(50);
  const view = viewFor(target);
  writeTag(target, 0, signature);
  writeTag(target, 4, "OTTO");
  view.setUint32(8, length);
  view.setUint16(12, 1);
  view.setUint32(16, 100);
  view.setUint32(20, 1);
  view.setUint16(24, 1);
  view.setUint16(26, 0);
  target[48] = 0; // cmap
  target[49] = 0; // origLength UIntBase128
  return target;
}

describe("inspectFontHeader", () => {
  it("parses a TTF SFNT header and table directory", () => {
    const result = inspectFontHeader(sfnt());
    expect(result.format).toBe("TTF/SFNT");
    expect(result.header.numTables).toBe(1);
    expect(result.tables[0]).toEqual({
      tag: "head",
      checksum: 0x12345678,
      offset: 32,
      length: 16,
    });
  });

  it("parses an OTTO CFF SFNT header", () => {
    expect(inspectFontHeader(sfnt("OTTO")).format).toBe("OTF (CFF SFNT)");
  });

  it("parses a WOFF header and table directory", () => {
    const result = inspectFontHeader(woff());
    expect(result.header).toMatchObject({
      signature: "wOFF",
      flavor: "OTTO",
      majorVersion: 1,
      minorVersion: 2,
    });
    expect(result.tables[0]).toEqual({
      tag: "cmap",
      offset: 64,
      compLength: 8,
      origLength: 12,
      origChecksum: 0xaabbccdd,
    });
  });

  it("parses a WOFF2 header", () => {
    const result = inspectFontHeader(woff2());
    expect(result.header).toMatchObject({
      signature: "wOF2",
      totalCompressedSize: 1,
      numTables: 1,
    });
    expect(result.tables).toEqual([
      {
        tag: "cmap",
        origLength: 0,
        transformVersion: 0,
        transformLength: null,
      },
    ]);
  });

  it.each([
    ["TTF", sfnt().slice(0, 20)],
    ["OTF", sfnt("OTTO").slice(0, 20)],
    ["WOFF", woff("wOFF", 120)],
    ["WOFF2", woff2("wOF2", 60)],
  ])("rejects truncated %s input with a graceful Error", (_format, target) => {
    expect(() => inspectFontHeader(target)).toThrow(
      /truncated|extends beyond/i,
    );
  });
});
