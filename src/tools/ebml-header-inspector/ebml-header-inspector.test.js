import { describe, expect, it } from "vitest";
import {
  EbmlParseError,
  parseEbmlHeader,
} from "./ebml-header-inspector.utils.js";

function bytes(...values) {
  return new Uint8Array(values.flat());
}
const sample = bytes(
  0x1a,
  0x45,
  0xdf,
  0xa3,
  0x8b,
  0x42,
  0x82,
  0x84,
  ..."webm".split("").map((x) => x.charCodeAt(0)),
  0x42,
  0x87,
  0x81,
  0x04,
  0x18,
  0x53,
  0x80,
  0x67,
  0xff,
  0x15,
  0x49,
  0xa9,
  0x66,
  0x95,
  0x2a,
  0xd7,
  0xb1,
  0x83,
  0x0f,
  0x42,
  0x40,
  0x44,
  0x89,
  0x84,
  0x41,
  0x20,
  0x00,
  0x00,
  0x7b,
  0xa9,
  0x84,
  ..."Demo".split("").map((x) => x.charCodeAt(0)),
  0x16,
  0x54,
  0xae,
  0x6b,
  0x99,
  0xae,
  0x97,
  0xd7,
  0x81,
  0x01,
  0x83,
  0x81,
  0x01,
  0x86,
  0x85,
  ..."V_VP9".split("").map((x) => x.charCodeAt(0)),
  0xe0,
  0x88,
  0xb0,
  0x82,
  0x07,
  0x80,
  0xba,
  0x82,
  0x04,
  0x38,
);

describe("parseEbmlHeader", () => {
  it("parses EBML, Segment Info, and video track metadata", () => {
    expect(parseEbmlHeader(sample)).toEqual({
      docType: "webm",
      docTypeVersion: 4,
      info: { timecodeScale: 1000000, duration: 10, title: "Demo" },
      tracks: [
        {
          number: 1,
          type: "Video",
          codecId: "V_VP9",
          width: 1920,
          height: 1080,
        },
      ],
    });
  });
  it.each([
    [bytes(0, 1, 2, 3), "BAD_MAGIC"],
    [bytes(0x1a, 0x45, 0xdf, 0xa3), "TRUNCATED_VINT"],
    [bytes(0x1a, 0x45, 0xdf, 0xa3, 0x85, 0x42), "TRUNCATED_ELEMENT"],
    [bytes(0x1a, 0x45, 0xdf, 0xa3, 0x80, 0), "INVALID_VINT"],
  ])("classifies malformed data as %s", (input, code) => {
    try {
      parseEbmlHeader(input);
    } catch (error) {
      expect(error).toBeInstanceOf(EbmlParseError);
      expect(error.code).toBe(code);
      return;
    }
    throw new Error("Expected parser to throw");
  });
});
