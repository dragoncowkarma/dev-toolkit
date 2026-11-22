import { describe, expect, it } from "vitest";
import { inspectNetpbmHeader } from "./netpbm.utils.js";

const bytes = (text) => new TextEncoder().encode(text);

describe("inspectNetpbmHeader", () => {
  it("parses a P6 header with comments and raw payload accounting", () => {
    const result = inspectNetpbmHeader(
      bytes("P6\n# camera export\n2 1\n255\nabcdef"),
    );
    expect(result.valid).toBe(true);
    expect(result.fields).toMatchObject({
      magic: "P6",
      width: 2,
      height: 1,
      channels: 3,
      bitsPerSample: 8,
      expectedPayloadSize: 6,
      availablePayloadSize: 6,
    });
  });

  it("parses a P4 bitmap without MAXVAL", () => {
    const result = inspectNetpbmHeader(bytes("P4\n9 2\nabc"));
    expect(result.valid).toBe(true);
    expect(result.fields).toMatchObject({
      maxval: null,
      bitsPerSample: 1,
      expectedPayloadSize: 4,
      availablePayloadSize: 3,
    });
  });

  it("parses a PAM header through ENDHDR", () => {
    const result = inspectNetpbmHeader(
      bytes(
        "P7\nWIDTH 2\nHEIGHT 1\nDEPTH 4\nMAXVAL 255\nTUPLTYPE RGB_ALPHA\nENDHDR\n12345678",
      ),
    );
    expect(result.valid).toBe(true);
    expect(result.fields).toMatchObject({
      magic: "P7",
      channels: 4,
      tupleType: "RGB_ALPHA",
      expectedPayloadSize: 8,
      availablePayloadSize: 8,
    });
  });

  it("returns unavailable fields for truncated or invalid input", () => {
    const result = inspectNetpbmHeader(bytes("P6\n10 20"));
    expect(result).toMatchObject({ valid: false, fields: null });
    expect(result.error).toMatch(/truncated/i);
  });
});
