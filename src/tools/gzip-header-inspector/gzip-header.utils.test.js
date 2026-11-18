import { describe, expect, it } from "vitest";
import { parseGzipMembers } from "./gzip-header.utils.js";

function member({
  flags = 0,
  extra = [],
  name = "",
  comment = "",
  hcrc = false,
  payload = [3, 0],
  crc = 0,
  size = 0,
} = {}) {
  const header = [0x1f, 0x8b, 8, flags, 0, 0, 0, 0, 0, 3];
  if (flags & 4) {
    const data = extra.flatMap(({ id, data }) => [
      id.charCodeAt(0),
      id.charCodeAt(1),
      data.length,
      0,
      ...data,
    ]);
    header.push(data.length, 0, ...data);
  }
  if (flags & 8) header.push(...new TextEncoder().encode(name), 0);
  if (flags & 16) header.push(...new TextEncoder().encode(comment), 0);
  if (flags & 2 || hcrc) header.push(0x34, 0x12);
  return new Uint8Array([
    ...header,
    ...payload,
    crc & 255,
    (crc >>> 8) & 255,
    (crc >>> 16) & 255,
    (crc >>> 24) & 255,
    size & 255,
    (size >>> 8) & 255,
    (size >>> 16) & 255,
    (size >>> 24) & 255,
  ]);
}
describe("parseGzipMembers", () => {
  it("parses a valid minimal member header and trailer", () => {
    const [parsed] = parseGzipMembers(member({ crc: 0x12345678, size: 12 }));
    expect(parsed.compressionMethod).toBe("Deflate (0x08)");
    expect(parsed.crc32).toBe("0x12345678");
    expect(parsed.inputSize).toBe(12);
  });
  it("parses FEXTRA subfields, FNAME, FCOMMENT and FHCRC", () => {
    const [parsed] = parseGzipMembers(
      member({
        flags: 0x1e,
        extra: [{ id: "AB", data: [9, 8] }],
        name: "file.txt",
        comment: "hello",
      }),
    );
    expect(parsed.extraFields).toEqual([
      { id: "AB", length: 2, data: "09 08" },
    ]);
    expect(parsed.originalFilename).toBe("file.txt");
    expect(parsed.comment).toBe("hello");
    expect(parsed.headerCrc16).toBe("0x1234");
  });
  it("parses concatenated members", () => {
    const first = member({ size: 1 });
    const second = member({ size: 2 });
    const joined = new Uint8Array(first.length + second.length);
    joined.set(first);
    joined.set(second, first.length);
    expect(parseGzipMembers(joined).map((item) => item.inputSize)).toEqual([
      1, 2,
    ]);
  });
  it("rejects non-GZIP input and truncated fixed headers", () => {
    expect(() => parseGzipMembers(new Uint8Array([1, 2]))).toThrow(
      /Not a GZIP/,
    );
    expect(() => parseGzipMembers(new Uint8Array([0x1f, 0x8b, 8]))).toThrow(
      /truncated fixed header/,
    );
  });
  it("rejects truncated optional fields and trailers", () => {
    expect(() =>
      parseGzipMembers(
        new Uint8Array([0x1f, 0x8b, 8, 4, 0, 0, 0, 0, 0, 3, 4, 0, 1]),
      ),
    ).toThrow(/FEXTRA data/);
    expect(() =>
      parseGzipMembers(
        new Uint8Array([0x1f, 0x8b, 8, 8, 0, 0, 0, 0, 0, 3, 65]),
      ),
    ).toThrow(/FNAME/);
    expect(() =>
      parseGzipMembers(member({ payload: [3, 0] }).slice(0, -2)),
    ).toThrow(/trailer/);
  });
});
