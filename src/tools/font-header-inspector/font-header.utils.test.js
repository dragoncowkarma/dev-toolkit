import { describe, expect, it } from "vitest";
import { parseSfnt } from "./font-header.utils.js";

function writeTag(bytes, offset, tag) {
  [...tag].forEach((character, index) => {
    bytes[offset + index] = character.charCodeAt(0);
  });
}

function makeFont({ version = 0x00010000, tables = [] } = {}) {
  const size = Math.max(
    12 + tables.length * 16,
    ...tables.map((table) => table.offset + table.data.length),
  );
  const bytes = new Uint8Array(size);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, version, false);
  view.setUint16(4, tables.length, false);
  tables.forEach((table, index) => {
    const record = 12 + index * 16;
    writeTag(bytes, record, table.tag);
    view.setUint32(record + 4, table.checksum ?? 0, false);
    view.setUint32(record + 8, table.offset, false);
    view.setUint32(record + 12, table.data.length, false);
    bytes.set(table.data, table.offset);
  });
  return bytes;
}

function headData() {
  const data = new Uint8Array(54);
  const view = new DataView(data.buffer);
  view.setUint16(18, 1000, false);
  view.setBigInt64(20, 2082844800n, false);
  view.setBigInt64(28, 2082844801n, false);
  view.setInt16(50, 1, false);
  return data;
}

function maxpData() {
  const data = new Uint8Array(6);
  new DataView(data.buffer).setUint16(4, 321, false);
  return data;
}

describe("parseSfnt", () => {
  it("parses a TrueType header, table directory, and key-table fields", () => {
    const result = parseSfnt(
      makeFont({
        tables: [
          { tag: "head", offset: 64, data: headData() },
          { tag: "maxp", offset: 128, data: maxpData() },
          {
            tag: "cmap",
            offset: 160,
            data: new Uint8Array(4),
            checksum: 0x12345678,
          },
        ],
      }),
    );

    expect(result.sfntVersion).toMatchObject({
      hex: "0x00010000",
      label: "TrueType outlines",
    });
    expect(result.numTables).toBe(3);
    expect(result.tables[2]).toMatchObject({
      tag: "cmap",
      label: "Character to glyph mapping",
      inBounds: true,
    });
    expect(result.head).toMatchObject({
      unitsPerEm: 1000,
      indexToLocFormat: 1,
    });
    expect(result.head.created.iso).toBe("1970-01-01T00:00:00.000Z");
    expect(result.maxp).toEqual({ numGlyphs: 321 });
  });

  it("recognizes the OTTO flavor used by CFF OpenType fonts", () => {
    const result = parseSfnt(
      makeFont({
        version: 0x4f54544f,
        tables: [{ tag: "CFF ", offset: 32, data: new Uint8Array(4) }],
      }),
    );

    expect(result.sfntVersion).toMatchObject({
      hex: "0x4f54544f",
      label: "OpenType with CFF outlines",
    });
    expect(result.tables[0]).toMatchObject({
      tag: "CFF ",
      label: "Compact Font Format outlines",
    });
  });

  it("reports a path-qualified bounds error for a truncated table directory", () => {
    const bytes = new Uint8Array(12);
    const view = new DataView(bytes.buffer);
    view.setUint16(4, 1, false);

    expect(() => parseSfnt(bytes)).toThrow(
      /SFNT table directory: need 16 byte\(s\) at offset 12/,
    );
  });

  it("marks directory entries whose table data falls outside the file", () => {
    const bytes = makeFont({
      tables: [{ tag: "name", offset: 32, data: new Uint8Array(1) }],
    });
    new DataView(bytes.buffer).setUint32(24, 99, false);

    expect(parseSfnt(bytes).tables[0].inBounds).toBe(false);
  });
});
