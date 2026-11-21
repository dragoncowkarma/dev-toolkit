import { describe, expect, it } from "vitest";
import { parseEbmlHeader } from "./ebml-header-inspector.utils.js";

function bytes(...values) {
  return new Uint8Array(values.flat());
}

function concat(...parts) {
  const length = parts.reduce((total, part) => total + part.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function element(id, value) {
  return concat(Uint8Array.from(id), Uint8Array.of(0x80 + value.length), value);
}

function text(value) {
  return new TextEncoder().encode(value);
}

function float64(value) {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setFloat64(0, value, false);
  return bytes;
}
const sample = bytes(
  0x1a,
  0x45,
  0xdf,
  0xa3,
  0x93,
  0x42,
  0x86,
  0x81,
  0x01,
  0x42,
  0xf7,
  0x81,
  0x01,
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
  0x9c,
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
  0x4d,
  0x80,
  0x84,
  ..."mkv!".split("").map((x) => x.charCodeAt(0)),
  0x57,
  0x41,
  0x84,
  ..."tool".split("").map((x) => x.charCodeAt(0)),
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
      status: "decoded",
      ebml: {
        version: 1,
        readVersion: 1,
        docType: "webm",
        docTypeVersion: 4,
      },
      segment: {
        info: {
          timecodeScale: 1000000,
          duration: 10,
          muxingApp: "mkv!",
          writingApp: "tool",
        },
        tracks: [
          {
            number: 1,
            type: "Video",
            codecId: "V_VP9",
            width: 1920,
            height: 1080,
          },
        ],
      },
    });
  });

  it("enumerates video and audio tracks in an unknown-size segment", () => {
    const video = element(
      [0xae],
      concat(
        element([0xd7], Uint8Array.of(1)),
        element([0x83], Uint8Array.of(1)),
        element([0x86], text("V_VP9")),
      ),
    );
    const audio = element(
      [0xae],
      concat(
        element([0xd7], Uint8Array.of(2)),
        element([0x83], Uint8Array.of(2)),
        element([0x86], text("A_OPUS")),
        element(
          [0xe1],
          concat(
            element([0xb5], float64(48000)),
            element([0x9f], Uint8Array.of(2)),
          ),
        ),
      ),
    );
    const header = element(
      [0x1a, 0x45, 0xdf, 0xa3],
      concat(
        element([0x42, 0x82], text("webm")),
        element([0x42, 0x87], Uint8Array.of(4)),
      ),
    );
    const tracks = element([0x16, 0x54, 0xae, 0x6b], concat(video, audio));
    const unknownSizeSegment = concat(
      Uint8Array.of(0x18, 0x53, 0x80, 0x67, 0xff),
      tracks,
    );

    expect(parseEbmlHeader(concat(header, unknownSizeSegment))).toMatchObject({
      status: "decoded",
      ebml: { docType: "webm", docTypeVersion: 4 },
      segment: {
        tracks: [
          { number: 1, type: "Video", codecId: "V_VP9" },
          {
            number: 2,
            type: "Audio",
            codecId: "A_OPUS",
            sampleRate: 48000,
            channels: 2,
          },
        ],
      },
    });
  });
  it.each([
    [bytes(0, 1, 2, 3), "BAD_MAGIC"],
    [bytes(0x1a, 0x45, 0xdf, 0xa3), "TRUNCATED_VINT"],
    [bytes(0x1a, 0x45, 0xdf, 0xa3, 0x85, 0x42), "TRUNCATED_ELEMENT"],
    [bytes(0x1a, 0x45, 0xdf, 0xa3, 0x80, 0), "INVALID_VINT"],
  ])("returns structured undecoded data for malformed input", (input) => {
    expect(parseEbmlHeader(input)).toMatchObject({ status: "undecoded" });
  });
});
