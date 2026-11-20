import { describe, expect, it } from "vitest";
import { parseClassFile } from "./classFile.utils.js";

function bytes(...values) {
  return new Uint8Array(values.flat()).buffer;
}
function utf8(text) {
  return [
    1,
    0,
    text.length,
    ...text.split("").map((char) => char.charCodeAt(0)),
  ];
}
function minimalClass() {
  return bytes(
    [0xca, 0xfe, 0xba, 0xbe, 0, 0, 0, 65, 0, 5],
    utf8("Example"),
    [7, 0, 1],
    utf8("java/lang/Object"),
    [7, 0, 3],
    [0, 0x21, 0, 2, 0, 4, 0, 0, 0, 0, 0, 0, 0, 0],
  );
}

describe("parseClassFile", () => {
  it("parses a valid minimal class file", () => {
    const result = parseClassFile(minimalClass());
    expect(result).toMatchObject({
      magic: "0xCAFEBABE",
      majorVersion: 65,
      jdkRelease: "Java 21",
      thisClass: "Example",
      superClass: "java/lang/Object",
    });
  });

  it("rejects a truncated file with a bounds error", () => {
    expect(() => parseClassFile(bytes(0xca, 0xfe))).toThrow(
      "Truncated class file",
    );
  });

  it("rejects an invalid magic number", () => {
    expect(() => parseClassFile(bytes(0, 0, 0, 0))).toThrow(
      "Invalid class file magic number",
    );
  });

  it("resolves representative constant-pool entries", () => {
    const buffer = bytes(
      [0xca, 0xfe, 0xba, 0xbe, 0, 0, 0, 65, 0, 11],
      utf8("Example"),
      [7, 0, 1],
      utf8("java/lang/Object"),
      [7, 0, 3],
      utf8("value"),
      [8, 0, 5],
      utf8("toString"),
      utf8("()Ljava/lang/String;"),
      [12, 0, 7, 0, 8],
      [10, 0, 4, 0, 9],
      [0, 0x21, 0, 2, 0, 4, 0, 0, 0, 0, 0, 0, 0, 0],
    );
    const values = parseClassFile(buffer).constantPool.map(
      (entry) => entry.value,
    );
    expect(values).toContain('"value"');
    expect(values).toContain("Example");
    expect(values).toContain("java/lang/Object.toString:()Ljava/lang/String;");
  });
});
