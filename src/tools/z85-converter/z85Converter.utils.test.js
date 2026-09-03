import { describe, expect, it } from "vitest";
import {
  decodeZ85,
  encodeZ85,
  formatByteOutput,
  padBytesToZ85Block,
  parseByteInput,
} from "./z85Converter.utils.js";

describe("Z85 utilities", () => {
  it("encodes the ZeroMQ specification example", () => {
    expect(encodeZ85(parseByteInput("86 4F D2 6F B5 59 F7 5B"))).toBe(
      "HelloWorld",
    );
  });

  it("decodes the ZeroMQ specification example", () => {
    expect(formatByteOutput(decodeZ85("HelloWorld"))).toBe(
      "86 4F D2 6F B5 59 F7 5B",
    );
  });

  it("parses flexible hexadecimal bytes and formats them consistently", () => {
    expect(formatByteOutput(parseByteInput("0x00, ff 7A"))).toBe("00 FF 7A");
  });

  it("pads bytes only to the next Z85 block", () => {
    expect(
      formatByteOutput(padBytesToZ85Block(parseByteInput("01 02 03"))),
    ).toBe("01 02 03 00");
    expect(padBytesToZ85Block(parseByteInput("01 02 03 04"))).toHaveLength(4);
  });

  it("rejects unaligned values and invalid characters", () => {
    expect(() => encodeZ85(parseByteInput("01"))).toThrow(/multiple of 4/);
    expect(() => decodeZ85("abcd")).toThrow(/multiple of 5/);
    expect(() => decodeZ85("abcd~")).toThrow(/Invalid Z85 character/);
    expect(() => parseByteInput("0GG")).toThrow(/hexadecimal pairs/);
  });
});
