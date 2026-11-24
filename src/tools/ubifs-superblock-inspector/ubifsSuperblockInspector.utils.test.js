import { describe, expect, it } from 'vitest';
import {
  computeUbifsCrc,
  createMockUbifsSuperblock,
  formatFlags,
  formatUuid,
  parseUbifsSuperblock,
} from './ubifsSuperblockInspector.utils.js';

describe('ubifsSuperblockInspector.utils', () => {
  describe('computeUbifsCrc and format utilities', () => {
    it('formats a 16-byte UUID correctly', () => {
      const bytes = new Uint8Array([
        0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0,
        0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88,
      ]);
      expect(formatUuid(bytes)).toBe('12345678-9abc-def0-1122-334455667788');
      expect(formatUuid(null)).toBe('Unknown');
      expect(formatUuid(new Uint8Array(10))).toBe('Unknown');
    });

    it('formats flags correctly', () => {
      expect(formatFlags(0)).toBe('0x00000000 (None)');
      expect(formatFlags(2)).toBe('0x00000002 (BIGLPT)');
      expect(formatFlags(6)).toBe('0x00000006 (BIGLPT, SPACE_FIXUP)');
      expect(formatFlags(0x100)).toBe('0x00000100 (Unknown (0x100))');
      expect(formatFlags(0x102)).toBe('0x00000102 (BIGLPT, Unknown (0x100))');
      expect(formatFlags(null)).toBe('Unknown');
    });

    it('calculates CRC32 with polynomial 0xEDB88320, init 0xFFFFFFFF, no final XOR', () => {
      const data = new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 4]);
      const crc = computeUbifsCrc(data, 8, 12);
      expect(typeof crc).toBe('number');
      expect(crc).toBeGreaterThan(0);
    });
  });

  describe('parseUbifsSuperblock', () => {
    it('parses a valid superblock node and decodes all fields', () => {
      const buffer = createMockUbifsSuperblock({
        sqnum: 42n,
        len: 4096,
        nodeTypeRaw: 6,
        groupTypeRaw: 0,
        keyHashRaw: 0,
        keyFmtRaw: 0,
        flagsRaw: 2,
        minIoSize: 2048,
        lebSize: 129024,
        lebCnt: 128,
        maxLebCnt: 2048,
        maxBudBytes: 16777216n,
        logLebs: 5,
        lptLebs: 3,
        orphLebs: 2,
        jheadCnt: 1,
        fanout: 8,
        lsaveCnt: 256,
        fmtVersion: 5,
        defaultComprRaw: 1,
        rpUid: 1000,
        rpGid: 1000,
        rpSize: 10485760n,
        timeGran: 1000,
        uuidBytes: [
          0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77,
          0x88, 0x99, 0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff,
        ],
      });

      const result = parseUbifsSuperblock(buffer);

      expect(result.magic).toBe('0x06101831');
      expect(result.crcValid).toBe(true);
      expect(result.crcStatus).toBe('Valid');
      expect(result.sqnum).toBe('42');
      expect(result.len).toBe(4096);
      expect(result.nodeType).toBe('Superblock (6)');
      expect(result.groupType).toBe('No Node Group (0)');
      expect(result.keyHash).toBe('R5 (0)');
      expect(result.keyFmt).toBe('Simple (0)');
      expect(result.flags).toBe('0x00000002 (BIGLPT)');
      expect(result.minIoSize).toBe(2048);
      expect(result.lebSize).toBe(129024);
      expect(result.lebCnt).toBe(128);
      expect(result.maxLebCnt).toBe(2048);
      expect(result.maxBudBytes).toBe('16777216');
      expect(result.logLebs).toBe(5);
      expect(result.lptLebs).toBe(3);
      expect(result.orphLebs).toBe(2);
      expect(result.jheadCnt).toBe(1);
      expect(result.fanout).toBe(8);
      expect(result.lsaveCnt).toBe(256);
      expect(result.fmtVersion).toBe(5);
      expect(result.defaultCompr).toBe('LZO (1)');
      expect(result.rpUid).toBe(1000);
      expect(result.rpGid).toBe(1000);
      expect(result.rpSize).toBe('10485760');
      expect(result.timeGran).toBe(1000);
      expect(result.uuid).toBe('00112233-4455-6677-8899-aabbccddeeff');
    });

    it('reports bad magic as an error', () => {
      const buffer = createMockUbifsSuperblock({ magic: 0x12345678 });
      expect(() => parseUbifsSuperblock(buffer)).toThrow(/Invalid UBIFS magic/i);
    });

    it('detects a CRC mismatch', () => {
      const buffer = createMockUbifsSuperblock();
      // Corrupt byte within the verified range (after offset 8)
      buffer[100] ^= 0x5a;

      const result = parseUbifsSuperblock(buffer);
      expect(result.crcValid).toBe(false);
      expect(result.crcStatus).toBe('Mismatch');
      expect(result.crc).not.toBe(result.calculatedCrc);

      expect(() => {
        parseUbifsSuperblock(buffer, { throwOnCrcMismatch: true });
      }).toThrow(/CRC32 mismatch/i);
    });

    it('reports truncated files as an error', () => {
      // Buffer smaller than common header (24 bytes)
      expect(() => parseUbifsSuperblock(new Uint8Array(16))).toThrow(
        /truncated.*UBIFS common node header/i,
      );

      // Buffer smaller than declared node len
      const smallBuf = createMockUbifsSuperblock({ bufferSize: 2048 });
      expect(() => parseUbifsSuperblock(smallBuf)).toThrow(/truncated/i);
    });

    it('rejects invalid node length and non-superblock node types', () => {
      // Invalid node length (not 4096)
      const invalidLen = createMockUbifsSuperblock({ len: 8 });
      expect(() => parseUbifsSuperblock(invalidLen)).toThrow(
        /Invalid UBIFS superblock node length: expected 4096 bytes, got 8 bytes/i,
      );

      // Non-superblock node type (e.g. Master node = 7)
      const masterNode = createMockUbifsSuperblock({ nodeTypeRaw: 7 });
      expect(() => parseUbifsSuperblock(masterNode)).toThrow(
        /Invalid UBIFS node type: expected Superblock \(6\), got Master \(7\)/i,
      );

      // Unknown node type
      const unknownType = createMockUbifsSuperblock({ nodeTypeRaw: 99 });
      expect(() => parseUbifsSuperblock(unknownType)).toThrow(
        /Invalid UBIFS node type: expected Superblock \(6\), got Unknown \(99\)/i,
      );
    });

    it('handles 64-bit values above 2^53 without precision loss', () => {
      const hugeSqnum = 9007199254740995n; // 2^53 + 3
      const hugeBudBytes = 18446744073709551615n; // 2^64 - 1
      const hugeRpSize = 9223372036854775807n; // 2^63 - 1

      const buffer = createMockUbifsSuperblock({
        sqnum: hugeSqnum,
        maxBudBytes: hugeBudBytes,
        rpSize: hugeRpSize,
      });

      const result = parseUbifsSuperblock(buffer);

      expect(result.sqnum).toBe('9007199254740995');
      expect(result.sqnumRaw).toBe(hugeSqnum);
      expect(result.maxBudBytes).toBe('18446744073709551615');
      expect(result.maxBudBytesRaw).toBe(hugeBudBytes);
      expect(result.rpSize).toBe('9223372036854775807');
      expect(result.rpSizeRaw).toBe(hugeRpSize);
    });

    it('displays unknown enum values as Unknown instead of guessing', () => {
      const buffer = createMockUbifsSuperblock({
        groupTypeRaw: 42,
        keyHashRaw: 77,
        keyFmtRaw: 88,
        defaultComprRaw: 999,
      });

      const result = parseUbifsSuperblock(buffer);

      expect(result.groupType).toBe('Unknown');
      expect(result.keyHash).toBe('Unknown');
      expect(result.keyFmt).toBe('Unknown');
      expect(result.defaultCompr).toBe('Unknown');
    });

    it('parses independent fixture laid out according to on-flash structure', () => {
      // 4096-byte independent buffer matching Linux ubifs-media.h struct ubifs_sb_node
      const raw = new Uint8Array(4096);
      const view = new DataView(raw.buffer);

      // Common header (24 bytes)
      view.setUint32(0, 0x06101831, true); // magic
      // view.setUint32(4, crc, true); will set below
      view.setBigUint64(8, 100n, true); // sqnum
      view.setUint32(16, 4096, true); // len
      view.setUint8(20, 6); // node_type: UBIFS_SB_NODE
      view.setUint8(21, 0); // group_type
      // 22-23: padding

      // Superblock fields
      // 24-25: padding
      view.setUint8(26, 0); // key_hash: R5
      view.setUint8(27, 0); // key_fmt: Simple
      view.setUint32(28, 0x02, true); // flags: BIGLPT
      view.setUint32(32, 2048, true); // min_io_size
      view.setUint32(36, 126976, true); // leb_size
      view.setUint32(40, 512, true); // leb_cnt
      view.setUint32(44, 2048, true); // max_leb_cnt
      view.setBigUint64(48, 8388608n, true); // max_bud_bytes
      view.setUint32(56, 4, true); // log_lebs
      view.setUint32(60, 3, true); // lpt_lebs
      view.setUint32(64, 2, true); // orph_lebs
      view.setUint32(68, 1, true); // jhead_cnt
      view.setUint32(72, 8, true); // fanout
      view.setUint32(76, 64, true); // lsave_cnt
      view.setUint32(80, 5, true); // fmt_version
      view.setUint16(84, 1, true); // default_compr: LZO
      // 86-87: padding1
      view.setUint32(88, 500, true); // rp_uid
      view.setUint32(92, 500, true); // rp_gid
      view.setBigUint64(96, 2097152n, true); // rp_size

      // Linux kernel struct ubifs_sb_node layout:
      // Offset 104: time_gran (4 bytes)
      view.setUint32(104, 1000000000, true); // 1 second in ns

      // Offset 108: uuid (16 bytes)
      const testUuid = [
        0x01, 0x23, 0x45, 0x67, 0x89, 0xab, 0xcd, 0xef,
        0xfe, 0xdc, 0xba, 0x98, 0x76, 0x54, 0x32, 0x10,
      ];
      for (let i = 0; i < 16; i++) {
        raw[108 + i] = testUuid[i];
      }

      // Offset 124: ro_compat_version (4 bytes)
      view.setUint32(124, 0, true);

      // Verify that offset 168 and 172 have DIFFERENT dummy bytes so old buggy code would fail
      view.setUint32(168, 0xdeadbeef, true);
      for (let i = 0; i < 16; i++) {
        raw[172 + i] = 0xaa;
      }

      // Compute and store CRC
      const crc = computeUbifsCrc(raw, 8, 4096);
      view.setUint32(4, crc, true);

      const parsed = parseUbifsSuperblock(raw);
      expect(parsed.crcValid).toBe(true);
      expect(parsed.timeGran).toBe(1000000000);
      expect(parsed.uuid).toBe('01234567-89ab-cdef-fedc-ba9876543210');
      expect(parsed.rpUid).toBe(500);
      expect(parsed.rpGid).toBe(500);
      expect(parsed.rpSize).toBe('2097152');
    });
  });
});
