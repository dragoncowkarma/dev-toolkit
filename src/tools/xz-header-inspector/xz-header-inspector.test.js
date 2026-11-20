import { describe, expect, it } from "vitest";
import { createSampleXz, inspectXz } from "./xz-header-inspector.utils.js";

describe("inspectXz", () => {
  it.each([
    [0, "None"],
    [1, "CRC32"],
    [4, "CRC64"],
    [10, "SHA-256"],
  ])("parses %s check type", (checkType, checkName) => {
    expect(inspectXz(createSampleXz({ checkType }))).toMatchObject({
      checkType,
      checkName,
    });
  });
  it("parses multi-block streams", () => {
    const result = inspectXz(createSampleXz({ blocks: 2 }));
    expect(result.blocks).toHaveLength(2);
    expect(result.blocks[0].filters[0]).toMatchObject({
      name: "LZMA2",
      lzma2Property: 22,
    });
    expect(result.index.records).toHaveLength(2);
  });
  it.each([
    [8, "stream flags"],
    [20, "block 1 header"],
    [-16, "Index"],
  ])("rejects CRC mismatches", (offset, description) => {
    const bytes = createSampleXz();
    bytes[offset < 0 ? bytes.length + offset : offset] ^= 1;
    expect(() => inspectXz(bytes)).toThrow(new RegExp(description));
  });
  it("rejects non-XZ and truncated inputs descriptively", () => {
    expect(() => inspectXz(new Uint8Array(24))).toThrow(/magic/);
    expect(() => inspectXz(createSampleXz().slice(0, 16))).toThrow(
      /too short|truncated/,
    );
  });
});
