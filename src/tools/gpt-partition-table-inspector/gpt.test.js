import { describe, expect, it, vi } from 'vitest';
import {
  bytesToHex,
  crc32,
  createSampleGptBytes,
  formatBytes,
  formatGuid,
  formatHex32,
  formatHex64,
  MAX_GPT_BYTES,
  parseAttributeFlags,
  parseGpt,
  parseHexToBytes,
  readGptSlice,
} from './gpt.utils.js';

describe('formatGuid', () => {
  it('formats 16 bytes into mixed-endian GUID', () => {
    // EFI System Partition GUID: C12A7328-F81F-11D2-BA4B-00A0C93EC93B
    const raw = new Uint8Array([
      0x28, 0x73, 0x2A, 0xC1, 0x1F, 0xF8, 0xD2, 0x11,
      0xBA, 0x4B, 0x00, 0xA0, 0xC9, 0x3E, 0xC9, 0x3B,
    ]);
    expect(formatGuid(raw, 0)).toBe('C12A7328-F81F-11D2-BA4B-00A0C93EC93B');
  });
});

describe('crc32', () => {
  it('computes standard IEEE 802.3 CRC32', () => {
    const textBytes = new TextEncoder().encode('123456789');
    expect(crc32(textBytes)).toBe(0xCBF43926);
  });
});

describe('parseGpt with valid sample', () => {
  it('parses valid GPT header and verifies matching CRCs', () => {
    const sample = createSampleGptBytes();
    const result = parseGpt(sample);

    expect(result.signature).toBe('EFI PART');
    expect(result.sectorSize).toBe(512);
    expect(result.headerOffset).toBe(512);
    expect(result.revision).toContain('1.0');
    expect(result.headerSize).toBe(92);
    expect(result.headerCrcMatch).toBe(true);
    expect(result.computedHeaderCrc32).toBe(result.headerCrc32);
    expect(result.currentLba).toBe(1n);
    expect(result.backupLba).toBe(204799n);
    expect(result.firstUsableLba).toBe(34n);
    expect(result.lastUsableLba).toBe(204766n);
    expect(result.diskGuid).toBe('A1B2C3D4-E5F6-7890-1234-56789ABCDEF0');
    expect(result.partitionEntryLba).toBe(2n);
    expect(result.entryCount).toBe(128);
    expect(result.entrySize).toBe(128);
    expect(result.arrayCrcMatch).toBe(true);
  });

  it('parses partition entries and skips all-zero entries', () => {
    const sample = createSampleGptBytes();
    const result = parseGpt(sample);

    expect(result.partitions).toHaveLength(2);

    const [part1, part2] = result.partitions;

    expect(part1.index).toBe(1);
    expect(part1.name).toBe('EFI System');
    expect(part1.typeGuid).toBe('C12A7328-F81F-11D2-BA4B-00A0C93EC93B');
    expect(part1.typeName).toBe('EFI System Partition');
    expect(part1.firstLba).toBe(2048n);
    expect(part1.lastLba).toBe(102399n);
    expect(part1.sectorCount).toBe(100352n);
    expect(part1.attributeFlags).toContain('System Partition');

    expect(part2.index).toBe(2);
    expect(part2.name).toBe('Basic Data');
    expect(part2.typeGuid).toBe('EBD0A0A2-B9E5-4433-87C0-68B6B72699C7');
    expect(part2.typeName).toBe('Microsoft Basic Data');
    expect(part2.firstLba).toBe(102400n);
    expect(part2.lastLba).toBe(204766n);
  });
});

describe('parseGpt error handling', () => {
  it('throws error on bad signature', () => {
    const sample = createSampleGptBytes();
    // Corrupt signature
    sample[512] = 0x00;
    expect(() => parseGpt(sample)).toThrow(/Invalid GPT signature/);
  });

  it('throws error on truncated input (less than 604 bytes)', () => {
    const truncated = new Uint8Array(500);
    expect(() => parseGpt(truncated)).toThrow(/Truncated input/);
  });

  it('throws error when buffer ends before full header size', () => {
    const sample = createSampleGptBytes();
    // Set headerSize to 200 (within 512 sector limit, but exceeding sliced buffer of 650)
    const view = new DataView(sample.buffer);
    view.setUint32(512 + 12, 200, true);
    const sliced = sample.subarray(0, 650);
    expect(() => parseGpt(sliced)).toThrow(/Truncated header/);
  });
});

describe('4Kn disk support', () => {
  it('detects GPT header at offset 4096 with 4096-byte sectors', () => {
    const buffer = new Uint8Array(4096 + 512);
    const view = new DataView(buffer.buffer);

    // Set signature at 4096
    const sig = [0x45, 0x46, 0x49, 0x20, 0x50, 0x41, 0x52, 0x54];
    sig.forEach((b, i) => { buffer[4096 + i] = b; });
    view.setUint32(4096 + 8, 0x00010000, true);
    view.setUint32(4096 + 12, 92, true);

    const result = parseGpt(buffer);
    expect(result.sectorSize).toBe(4096);
    expect(result.headerOffset).toBe(4096);
  });
});

describe('file slice reading', () => {
  it('only reads first 34 sectors (17408 bytes) from file.slice', async () => {
    const sliceSpy = vi.fn().mockReturnValue(new Blob([new Uint8Array(100)]));
    const fakeFile = {
      slice: sliceSpy,
    };

    await readGptSlice(fakeFile);

    expect(sliceSpy).toHaveBeenCalledWith(0, MAX_GPT_BYTES);
    expect(sliceSpy).toHaveBeenCalledTimes(1);
  });

  it('rejects if file does not have slice method', async () => {
    await expect(readGptSlice(null)).rejects.toThrow(TypeError);
  });
});

describe('utility formatters', () => {
  it('formats byte sizes correctly', () => {
    expect(formatBytes(500)).toBe('500 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(10485760)).toBe('10.0 MB');
    expect(formatBytes(10737418240n)).toBe('10.00 GB');
  });

  it('formats hex numbers', () => {
    expect(formatHex32(0x1234ABCD)).toBe('0x1234ABCD');
    expect(formatHex64(0x123456789ABCDEF0n)).toBe('0x123456789ABCDEF0');
  });

  it('parses attribute flags', () => {
    const flags = parseAttributeFlags(1n | (1n << 60n) | (1n << 63n));
    expect(flags).toContain('System Partition');
    expect(flags).toContain('Read-Only');
    expect(flags).toContain('Do Not Automount');
    expect(flags).not.toContain('Hidden');
  });

  it('converts hex to bytes and bytes to hex', () => {
    const hex = '4546492050415254';
    const bytes = parseHexToBytes(hex);
    expect(bytes).toHaveLength(8);
    expect(bytesToHex(bytes)).toBe(hex.toLowerCase());
  });
});
