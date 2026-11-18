import { describe, expect, it } from "vitest";
import {
  inspectMachO,
  MachOParseError,
} from "./macho-header-inspector.utils.js";

function setBytes(target, offset, source) {
  target.set(source, offset);
}

function writeHeader(target, offset, options = {}) {
  const {
    magic = 0xfeedfacf,
    cpu = 0x01000007,
    type = 2,
    commandCount = 0,
    commandSize = 0,
    flags = 0,
  } = options;
  const view = new DataView(target.buffer);
  view.setUint32(offset, magic, false);
  view.setUint32(offset + 4, cpu, false);
  view.setUint32(offset + 8, 0, false);
  view.setUint32(offset + 12, type, false);
  view.setUint32(offset + 16, commandCount, false);
  view.setUint32(offset + 20, commandSize, false);
  view.setUint32(offset + 24, flags, false);
}

function ascii(target, offset, value) {
  setBytes(target, offset, new TextEncoder().encode(value));
}

describe("inspectMachO", () => {
  it("parses a valid minimal 64-bit Mach-O header", () => {
    const bytes = new Uint8Array(32);
    writeHeader(bytes, 0, { flags: 0x200000 });
    const result = inspectMachO(bytes.buffer);
    expect(result.isUniversal).toBe(false);
    expect(result.architectures[0]).toMatchObject({
      magic: "MH_MAGIC_64",
      cpu: "x86_64",
      fileType: "MH_EXECUTE",
      commandCount: 0,
      flags: ["MH_PIE"],
    });
  });

  it("parses every embedded architecture of a universal binary", () => {
    const bytes = new Uint8Array(112);
    const view = new DataView(bytes.buffer);
    view.setUint32(0, 0xcafebabe, false);
    view.setUint32(4, 2, false);
    view.setUint32(8, 0x01000007, false);
    view.setUint32(16, 48, false);
    view.setUint32(20, 32, false);
    view.setUint32(28, 0x0100000c, false);
    view.setUint32(36, 80, false);
    view.setUint32(40, 32, false);
    writeHeader(bytes, 48, { cpu: 0x01000007 });
    writeHeader(bytes, 80, { cpu: 0x0100000c, type: 6 });
    const result = inspectMachO(bytes.buffer);
    expect(result.isUniversal).toBe(true);
    expect(result.architectures.map((header) => header.fatCpu)).toEqual([
      "x86_64",
      "arm64",
    ]);
    expect(result.architectures[1].fileType).toBe("MH_DYLIB");
  });

  it("shows segment and dylib command details", () => {
    const segmentSize = 72 + 80;
    const dylibSize = 56;
    const bytes = new Uint8Array(32 + segmentSize + dylibSize + 0x200);
    const view = new DataView(bytes.buffer);
    writeHeader(bytes, 0, {
      commandCount: 2,
      commandSize: segmentSize + dylibSize,
    });
    view.setUint32(32, 0x19, false);
    view.setUint32(36, segmentSize, false);
    ascii(bytes, 40, "__TEXT");
    view.setBigUint64(56, 0x100000000n, false);
    view.setBigUint64(64, 0x1000n, false);
    view.setBigUint64(72, 0n, false);
    view.setBigUint64(80, 0x200n, false);
    view.setUint32(96, 1, false);
    ascii(bytes, 104, "__text");
    ascii(bytes, 120, "__TEXT");
    view.setBigUint64(136, 0x100000000n, false);
    view.setBigUint64(144, 0x20n, false);
    view.setUint32(152, 0, false);
    const dylibOffset = 32 + segmentSize;
    view.setUint32(dylibOffset, 0xc, false);
    view.setUint32(dylibOffset + 4, dylibSize, false);
    view.setUint32(dylibOffset + 8, 24, false);
    view.setUint32(dylibOffset + 16, 0x00020003, false);
    view.setUint32(dylibOffset + 20, 0x00010000, false);
    ascii(bytes, dylibOffset + 24, "/usr/lib/libSystem.B.dylib");
    const result = inspectMachO(bytes.buffer).architectures[0];
    expect(result.commands[0].segment).toMatchObject({
      name: "__TEXT",
      sections: [{ name: "__text" }],
    });
    expect(result.commands[1].dylib).toMatchObject({
      path: "/usr/lib/libSystem.B.dylib",
      currentVersion: "2.0.3",
    });
  });

  it("rejects truncated load command tables and invalid magic", () => {
    const truncated = new Uint8Array(32);
    writeHeader(truncated, 0, { commandCount: 1, commandSize: 8 });
    expect(() => inspectMachO(truncated.buffer)).toThrow(MachOParseError);
    expect(() => inspectMachO(new Uint8Array([1, 2, 3, 4]).buffer)).toThrow(
      "supported Mach-O magic",
    );
  });

  it("rejects malformed command sizes and segment file ranges", () => {
    const malformed = new Uint8Array(40);
    writeHeader(malformed, 0, { commandCount: 1, commandSize: 8 });
    new DataView(malformed.buffer).setUint32(32, 0x19, false);
    new DataView(malformed.buffer).setUint32(36, 4, false);
    expect(() => inspectMachO(malformed.buffer)).toThrow("invalid size");

    const segment = new Uint8Array(104);
    writeHeader(segment, 0, { commandCount: 1, commandSize: 72 });
    const view = new DataView(segment.buffer);
    view.setUint32(32, 0x19, false);
    view.setUint32(36, 72, false);
    view.setBigUint64(72, 90n, false);
    view.setBigUint64(80, 20n, false);
    expect(() => inspectMachO(segment.buffer)).toThrow(
      "outside its Mach-O image",
    );
  });
});
