import { describe, expect, it } from 'vitest';
import {
  calculateHeaderChecksum,
  createMockTarArchive,
  detectHeaderFormat,
  formatFileSize,
  formatMtime,
  formatPermissions,
  getEntryIcon,
  getEntryType,
  isChecksumValid,
  parseOctalBytes,
  parsePaxData,
  parseSizeBytes,
  parseTarArchive,
  readNullTerminatedString,
  TAR_BLOCK_SIZE,
  TarParseError,
  TYPE_FLAGS,
} from './tar-inspector.utils.js';

describe('formatFileSize', () => {
  it('formats bytes below 1KB', () => {
    expect(formatFileSize(0)).toBe('0 B');
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(1023)).toBe('1023 B');
  });

  it('formats kilobytes and megabytes', () => {
    expect(formatFileSize(1024)).toBe('1.0 KB');
    expect(formatFileSize(2048)).toBe('2.0 KB');
    expect(formatFileSize(1048576)).toBe('1.0 MB');
  });

  it('handles negative or invalid numbers safely', () => {
    expect(formatFileSize(-10)).toBe('0 B');
    expect(formatFileSize(NaN)).toBe('0 B');
    expect(formatFileSize(null)).toBe('0 B');
  });
});

describe('getEntryType and getEntryIcon', () => {
  it('returns appropriate type labels for all standard typeflags', () => {
    expect(getEntryType(TYPE_FLAGS.REGULAR)).toBe('File');
    expect(getEntryType(TYPE_FLAGS.REGULAR_NULL)).toBe('File');
    expect(getEntryType('')).toBe('File');
    expect(getEntryType(TYPE_FLAGS.HARDLINK)).toBe('Hard Link');
    expect(getEntryType(TYPE_FLAGS.SYMLINK)).toBe('Symlink');
    expect(getEntryType(TYPE_FLAGS.CHAR_DEV)).toBe('Character Device');
    expect(getEntryType(TYPE_FLAGS.BLOCK_DEV)).toBe('Block Device');
    expect(getEntryType(TYPE_FLAGS.DIRECTORY)).toBe('Directory');
    expect(getEntryType(TYPE_FLAGS.FIFO)).toBe('FIFO');
    expect(getEntryType(TYPE_FLAGS.GNU_LONGLINK)).toBe('GNU Long Name');
    expect(getEntryType(TYPE_FLAGS.GNU_LONGLINK_TARGET)).toBe('GNU Long Link');
    expect(getEntryType(TYPE_FLAGS.PAX_EXTENDED)).toBe('PAX Extended Header');
    expect(getEntryType('Z')).toBe('Unknown (Z)');
  });

  it('returns icons for types', () => {
    expect(getEntryIcon(TYPE_FLAGS.DIRECTORY)).toBe('📁');
    expect(getEntryIcon(TYPE_FLAGS.SYMLINK)).toBe('🔗');
    expect(getEntryIcon(TYPE_FLAGS.REGULAR)).toBe('📄');
    expect(getEntryIcon(TYPE_FLAGS.GNU_LONGLINK)).toBe('🔤');
  });
});

describe('formatPermissions', () => {
  it('formats standard file permissions', () => {
    expect(formatPermissions(0o644, '0')).toBe('-rw-r--r--');
    expect(formatPermissions(0o755, '0')).toBe('-rwxr-xr-x');
  });

  it('formats directory and symlink type indicators', () => {
    expect(formatPermissions(0o755, '5')).toBe('drwxr-xr-x');
    expect(formatPermissions(0o777, '2')).toBe('lrwxrwxrwx');
  });

  it('formats special device and pipe permissions', () => {
    expect(formatPermissions(0o660, '3')).toBe('crw-rw----');
    expect(formatPermissions(0o660, '4')).toBe('brw-rw----');
    expect(formatPermissions(0o600, '6')).toBe('prw-------');
  });

  it('handles setuid, setgid, and sticky bits', () => {
    expect(formatPermissions(0o4755, '0')).toBe('-rwsr-xr-x');
    expect(formatPermissions(0o2755, '0')).toBe('-rwxr-sr-x');
    expect(formatPermissions(0o1755, '0')).toBe('-rwxr-xr-t');
  });
});

describe('parseOctalBytes and parseSizeBytes', () => {
  it('parses null/space terminated octal values', () => {
    const bytes = new TextEncoder().encode('0000755\0');
    expect(parseOctalBytes(bytes)).toBe(0o755);
  });

  it('returns 0 for empty or null buffers', () => {
    expect(parseOctalBytes(new Uint8Array(8))).toBe(0);
  });

  it('parses GNU base-256 encoded large binary sizes', () => {
    // 0x80 followed by big-endian bytes
    const bytes = new Uint8Array(12);
    bytes[0] = 0x80;
    bytes[10] = 0x01;
    bytes[11] = 0x00; // 256
    expect(parseSizeBytes(bytes)).toBe(256);
  });

  it(
    'parses GNU base-256 encoded sizes carrying non-zero high byte within safe integer limit',
    () => {
      // 0x81 (marker bit 0x80 set, sign bit 0x40 clear, value bit 0x01) with 5 trailing bytes:
      // 1 * 256^5 = 1,099,511,627,776 (1 TiB, well within Number.MAX_SAFE_INTEGER)
      const bytes = new Uint8Array([0x81, 0x00, 0x00, 0x00, 0x00, 0x00]);
      expect(parseSizeBytes(bytes)).toBe(1099511627776);
    },
  );

  it('parses 12-byte GNU base-256 value at maximum safe integer boundary', () => {
    // Number.MAX_SAFE_INTEGER is 9007199254740991 (0x1f_ffff_ffff_ffff)
    const bytes = new Uint8Array(12);
    bytes[0] = 0x80;
    bytes[5] = 0x1f;
    bytes.fill(0xff, 6, 12);
    expect(parseSizeBytes(bytes)).toBe(Number.MAX_SAFE_INTEGER);
  });

  it(
    'rejects GNU base-256 size with non-zero high byte exceeding JavaScript safe integer limit',
    () => {
      // 12-byte field starting with 0x81 (2^88)
      const bytes = new Uint8Array(12);
      bytes[0] = 0x81;
      expect(() => parseSizeBytes(bytes)).toThrow(TarParseError);
      expect(() => parseSizeBytes(bytes)).toThrow(/exceeds JavaScript safe integer limit/i);
    },
  );

  it('rejects GNU base-256 size with 0x80 marker exceeding JavaScript safe integer limit', () => {
    // 12-byte field with 0x80 followed by high bytes (e.g. byte 1 is 1 -> 2^80)
    const bytes = new Uint8Array(12);
    bytes[0] = 0x80;
    bytes[1] = 0x01;
    expect(() => parseSizeBytes(bytes)).toThrow(TarParseError);
    expect(() => parseSizeBytes(bytes)).toThrow(/exceeds JavaScript safe integer limit/i);
  });

  it('rejects negative base-256 size', () => {
    const bytes = new Uint8Array(12);
    bytes[0] = 0xff; // high bit set and sign bit set
    expect(() => parseSizeBytes(bytes)).toThrow(TarParseError);
    expect(() => parseSizeBytes(bytes)).toThrow(/negative file size in base-256/i);
  });
});

describe('readNullTerminatedString and formatMtime', () => {
  it('reads UTF-8 strings up to null byte', () => {
    const bytes = new TextEncoder().encode('hello world\0ignored');
    expect(readNullTerminatedString(bytes)).toBe('hello world');
  });

  it('formats epoch seconds into UTC string', () => {
    expect(formatMtime(1700000000)).toBe('2023-11-14 22:13:20 UTC');
    expect(formatMtime(0)).toBe('1970-01-01 00:00:00 UTC');
  });
});

describe('calculateHeaderChecksum and isChecksumValid', () => {
  it('calculates unsigned and signed checksums correctly', () => {
    const header = new Uint8Array(TAR_BLOCK_SIZE);
    header[0] = 65; // 'A'
    const { unsignedSum, signedSum } = calculateHeaderChecksum(header);
    // 65 + 8 * 32 (checksum field treated as spaces) = 65 + 256 = 321
    expect(unsignedSum).toBe(321);
    expect(signedSum).toBe(321);
    expect(isChecksumValid(321, { unsignedSum, signedSum })).toBe(true);
    expect(isChecksumValid(999, { unsignedSum, signedSum })).toBe(false);
  });
});

describe('detectHeaderFormat', () => {
  it('identifies POSIX ustar', () => {
    expect(detectHeaderFormat('ustar', '00', '0')).toBe('POSIX ustar');
  });

  it('identifies GNU tar', () => {
    expect(detectHeaderFormat('ustar ', ' \0', '0')).toBe('GNU tar');
  });

  it('identifies PAX headers', () => {
    expect(detectHeaderFormat('ustar', '00', 'x')).toBe('POSIX PAX');
    expect(detectHeaderFormat('ustar', '00', 'g')).toBe('POSIX PAX');
  });

  it('identifies V7 legacy archives', () => {
    expect(detectHeaderFormat('', '', '0')).toBe('V7 (Legacy)');
  });
});

describe('parsePaxData', () => {
  it('parses standard PAX header key-value lines', () => {
    const raw = '31 path=test/long/filename.txt\n20 mtime=1700000000\n';
    const bytes = new TextEncoder().encode(raw);
    const parsed = parsePaxData(bytes);
    expect(parsed.path).toBe('test/long/filename.txt');
    expect(parsed.mtime).toBe('1700000000');
  });

  it('correctly parses multi-record non-ASCII PAX headers without desynchronization', () => {
    // POSIX PAX record lengths are defined in UTF-8 byte counts.
    // "café.txt" contains 'é' which is 2 bytes in UTF-8 (0xC3 0xA9) and 1 UTF-16 code unit in JS.
    // "18 path=café.txt\n" is 18 bytes in UTF-8 (17 characters in JS string).
    // If parsed using JS string offsets, the second record is desynchronized and lost.
    const raw = '18 path=café.txt\n20 mtime=1700000000\n';
    const bytes = new TextEncoder().encode(raw);
    const parsed = parsePaxData(bytes);
    expect(parsed.path).toBe('café.txt');
    expect(parsed.mtime).toBe('1700000000');
  });

  it('handles multi-byte UTF-8 records (Korean, emoji) across multiple records', () => {
    // "path=한글문서.txt" -> 5 + 4*3 + 4 = 21 bytes; "25 " is 3 bytes; "\n" is 1 byte -> 25 bytes.
    // "comment=🎉🚀" -> 8 + 4 + 4 = 16 bytes; "20 " is 3 bytes; "\n" is 1 byte -> 20 bytes.
    // "gid=1000" -> 8 bytes; "12 " is 3 bytes; "\n" is 1 byte -> 12 bytes.
    const raw = '25 path=한글문서.txt\n20 comment=🎉🚀\n12 gid=1000\n';
    const bytes = new TextEncoder().encode(raw);
    const parsed = parsePaxData(bytes);
    expect(parsed.path).toBe('한글문서.txt');
    expect(parsed.comment).toBe('🎉🚀');
    expect(parsed.gid).toBe('1000');
  });

  it('rejects a PAX record whose declared length extends beyond payload', () => {
    const raw = '100 path=x\n';
    const bytes = new TextEncoder().encode(raw);
    expect(() => parsePaxData(bytes)).toThrow(TarParseError);
    expect(() => parsePaxData(bytes)).toThrow(/extends beyond payload/i);
  });

  it('rejects a PAX record with missing trailing newline', () => {
    // 10 bytes ending in null instead of \n
    const bytes = new TextEncoder().encode('10 path=x\0');
    expect(() => parsePaxData(bytes)).toThrow(TarParseError);
    expect(() => parsePaxData(bytes)).toThrow(/missing trailing newline/i);
  });

  it('rejects a PAX record with invalid key=value format', () => {
    const missingEquals = new TextEncoder().encode('10 path:x\n');
    expect(() => parsePaxData(missingEquals)).toThrow(TarParseError);
    expect(() => parsePaxData(missingEquals)).toThrow(/invalid key=value format/i);

    const emptyKey = new TextEncoder().encode('7 =val\n');
    expect(() => parsePaxData(emptyKey)).toThrow(TarParseError);
    expect(() => parsePaxData(emptyKey)).toThrow(/invalid key=value format/i);
  });

  it('rejects a PAX record with non-numeric or too short declared length', () => {
    const nonNumeric = new TextEncoder().encode('abc path=x\n');
    expect(() => parsePaxData(nonNumeric)).toThrow(TarParseError);
    expect(() => parsePaxData(nonNumeric)).toThrow(/invalid length/i);

    const tooShort = new TextEncoder().encode('2 \n');
    expect(() => parsePaxData(tooShort)).toThrow(TarParseError);
    expect(() => parsePaxData(tooShort)).toThrow(/too short/i);
  });

  it('rejects a PAX record missing space length delimiter', () => {
    const noSpace = new TextEncoder().encode('100path=x\n');
    expect(() => parsePaxData(noSpace)).toThrow(TarParseError);
    expect(() => parsePaxData(noSpace)).toThrow(/missing length delimiter/i);
  });
});

describe('parseTarArchive', () => {
  it('parses an empty archive', () => {
    const result = parseTarArchive(new Uint8Array(0));
    expect(result.entries).toEqual([]);
    expect(result.totalSize).toBe(0);
    expect(result.format).toBe('Empty');
  });

  it('parses a valid ustar archive with multiple files', () => {
    const mockData = createMockTarArchive([
      { name: 'README.md', content: '# Hello World\n', mode: 0o644 },
      { name: 'src/index.js', content: 'console.log(42);\n', mode: 0o755 },
    ]);

    const result = parseTarArchive(mockData);
    expect(result.entries).toHaveLength(2);
    expect(result.format).toBe('POSIX ustar');

    const first = result.entries[0];
    expect(first.name).toBe('README.md');
    expect(first.size).toBe(14);
    expect(first.type).toBe('File');
    expect(first.permissions).toBe('-rw-r--r--');
    expect(first.checksumValid).toBe(true);

    const second = result.entries[1];
    expect(second.name).toBe('src/index.js');
    expect(second.size).toBe(17);
    expect(second.permissions).toBe('-rwxr-xr-x');
  });

  it('parses directory and symlink typeflags correctly', () => {
    const mockData = createMockTarArchive([
      { name: 'docs/', typeflag: TYPE_FLAGS.DIRECTORY, mode: 0o755 },
      {
        name: 'docs/current',
        typeflag: TYPE_FLAGS.SYMLINK,
        linkname: 'docs/v1',
        mode: 0o777,
      },
    ]);

    const result = parseTarArchive(mockData);
    expect(result.entries).toHaveLength(2);

    const dirEntry = result.entries[0];
    expect(dirEntry.name).toBe('docs/');
    expect(dirEntry.type).toBe('Directory');
    expect(dirEntry.permissions).toBe('drwxr-xr-x');
    expect(dirEntry.size).toBe(0);

    const linkEntry = result.entries[1];
    expect(linkEntry.name).toBe('docs/current');
    expect(linkEntry.type).toBe('Symlink');
    expect(linkEntry.linkname).toBe('docs/v1');
    expect(linkEntry.permissions).toBe('lrwxrwxrwx');
  });

  it('parses valid GNU long-name archive with ././@LongLink', () => {
    const longFilename = 'deep/nested/path/to/an/extremely/long/directory/structure/' +
      'with/a/filename/that/easily/exceeds/one/hundred/characters/data_file.json';

    const mockData = createMockTarArchive([
      {
        name: longFilename,
        content: '{"ok":true}',
        useGnuLongName: true,
      },
    ]);

    const result = parseTarArchive(mockData);
    // Should detect the GNU Long Name entry and resolve the filename on target entry
    expect(result.entries.length).toBeGreaterThanOrEqual(2);
    const longLinkEntry = result.entries.find((e) => e.typeflag === TYPE_FLAGS.GNU_LONGLINK);
    expect(longLinkEntry).toBeDefined();
    expect(longLinkEntry.type).toBe('GNU Long Name');

    const fileEntry = result.entries.find((e) => e.name === longFilename);
    expect(fileEntry).toBeDefined();
    expect(fileEntry.type).toBe('File');
    expect(fileEntry.size).toBe(11);
    expect(fileEntry.hasLongName).toBe(true);
  });

  it('throws descriptive TarParseError when header is smaller than 512 bytes', () => {
    const truncated = new Uint8Array(200);
    expect(() => parseTarArchive(truncated)).toThrow(TarParseError);
    expect(() => parseTarArchive(truncated)).toThrow(/smaller than minimum header size/i);
  });

  it('throws descriptive TarParseError when checksum is invalid', () => {
    const validData = createMockTarArchive([
      { name: 'test.txt', content: 'test data' },
    ]);
    // Corrupt one byte of the header outside checksum field
    const corrupted = new Uint8Array(validData);
    corrupted[10] = corrupted[10] ^ 0xff;

    expect(() => parseTarArchive(corrupted)).toThrow(TarParseError);
    expect(() => parseTarArchive(corrupted)).toThrow(/checksum mismatch/i);
  });

  it('throws descriptive TarParseError on truncated file data', () => {
    const validData = createMockTarArchive([
      { name: 'large.bin', content: new Uint8Array(1000) },
    ]);
    // Slice off data blocks, leaving only header
    const truncated = validData.subarray(0, 600);

    expect(() => parseTarArchive(truncated)).toThrow(TarParseError);
    expect(() => parseTarArchive(truncated)).toThrow(/extends beyond file end/i);
  });

  it('stops parsing at two consecutive zero-filled blocks and handles padding', () => {
    const validData = createMockTarArchive([
      { name: 'file1.txt', content: 'abc' },
    ]);
    // Add extra trailing padding blocks
    const padded = new Uint8Array(validData.length + TAR_BLOCK_SIZE * 5);
    padded.set(validData);

    const result = parseTarArchive(padded);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].name).toBe('file1.txt');
  });

  it('handles ustar prefix correctly', () => {
    const mockData = createMockTarArchive([
      { name: 'file.txt', prefix: 'nested/directory', content: 'content' },
    ]);
    const result = parseTarArchive(mockData);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].name).toBe('nested/directory/file.txt');
  });

  it('preserves PAX global records separately and applies them to every subsequent entry', () => {
    const globalPaxPayload = '20 mtime=1705000000\n20 uname=globaluser\n';
    const mockData = createMockTarArchive([
      {
        name: 'pax_global_header',
        typeflag: TYPE_FLAGS.PAX_GLOBAL,
        content: globalPaxPayload,
      },
      {
        name: 'file1.txt',
        content: 'content of file 1',
        mtime: 1600000000,
        uname: 'localuser',
      },
      {
        name: 'file2.txt',
        content: 'content of file 2',
        mtime: 1600000000,
        uname: 'localuser',
      },
    ]);

    const result = parseTarArchive(mockData);
    expect(result.entries).toHaveLength(3);
    expect(result.format).toBe('POSIX PAX');

    const globalHeader = result.entries[0];
    expect(globalHeader.typeflag).toBe(TYPE_FLAGS.PAX_GLOBAL);
    expect(globalHeader.type).toBe('PAX Global Header');
    expect(globalHeader.paxRecords).toEqual({
      mtime: '1705000000',
      uname: 'globaluser',
    });

    const file1 = result.entries[1];
    expect(file1.name).toBe('file1.txt');
    expect(file1.mtime).toBe(1705000000);
    expect(file1.uname).toBe('globaluser');

    const file2 = result.entries[2];
    expect(file2.name).toBe('file2.txt');
    expect(file2.mtime).toBe(1705000000);
    expect(file2.uname).toBe('globaluser');
  });

  it(
    'allows per-entry PAX extended headers to override global PAX without clearing globals',
    () => {
      const globalPaxPayload = '20 mtime=1705000000\n';
      const extPaxPayload = '20 mtime=1709999999\n';

      const mockData = createMockTarArchive([
        {
          name: 'pax_global_header',
          typeflag: TYPE_FLAGS.PAX_GLOBAL,
          content: globalPaxPayload,
        },
        {
          name: 'PaxHeader/file1.txt',
          typeflag: TYPE_FLAGS.PAX_EXTENDED,
          content: extPaxPayload,
        },
        {
          name: 'file1.txt',
          content: 'first file',
        },
        {
          name: 'file2.txt',
          content: 'second file',
        },
      ]);

      const result = parseTarArchive(mockData);
      expect(result.entries).toHaveLength(4);

      const file1 = result.entries[2];
      expect(file1.name).toBe('file1.txt');
      expect(file1.mtime).toBe(1709999999);

      const file2 = result.entries[3];
      expect(file2.name).toBe('file2.txt');
      expect(file2.mtime).toBe(1705000000);
    },
  );

  it('correctly resolves entries with multi-record non-ASCII PAX headers', () => {
    // Regression test: non-ASCII path in PAX header should not desynchronize
    // subsequent records (e.g. mtime)
    const paxPayload = '18 path=café.txt\n20 mtime=1700000000\n';
    const mockData = createMockTarArchive([
      {
        name: 'PaxHeader/cafe.txt',
        typeflag: TYPE_FLAGS.PAX_EXTENDED,
        content: paxPayload,
      },
      {
        name: 'fallback_name.txt',
        content: 'content of cafe',
        mtime: 123456,
      },
    ]);

    const result = parseTarArchive(mockData);
    expect(result.entries).toHaveLength(2);

    const paxHeader = result.entries[0];
    expect(paxHeader.paxRecords).toEqual({
      path: 'café.txt',
      mtime: '1700000000',
    });

    const targetEntry = result.entries[1];
    expect(targetEntry.name).toBe('café.txt');
    expect(targetEntry.mtime).toBe(1700000000);
  });

  it('rejects an entry when required 512-byte block padding is missing', () => {
    // Valid archive with 3-byte payload contains:
    // 512-byte header + 512-byte padded data + 1024-byte zero blocks
    const validData = createMockTarArchive([
      { name: 'three-bytes.txt', content: 'abc' },
    ]);
    // Truncate to header (512 bytes) + 3 payload bytes (515 bytes total),
    // missing required 509 padding bytes
    const truncatedPayloadPadding = validData.subarray(0, 515);

    expect(() => parseTarArchive(truncatedPayloadPadding)).toThrow(TarParseError);
    expect(() => parseTarArchive(truncatedPayloadPadding)).toThrow(/extends beyond file end/i);
  });

  it('applies effective per-entry PAX size to advance offset when raw header size differs', () => {
    // PAX header specifies size=1024, but raw header size is 0
    const paxPayload = '13 size=1024\n';
    const file1Data = new Uint8Array(1024);
    file1Data.fill(0xaa);

    const mockData = createMockTarArchive([
      {
        name: 'PaxHeader/file1.bin',
        typeflag: TYPE_FLAGS.PAX_EXTENDED,
        content: paxPayload,
      },
      {
        name: 'file1.bin',
        content: file1Data,
        headerSize: 0,
      },
      {
        name: 'file2.txt',
        content: 'next file contents',
      },
    ]);

    const result = parseTarArchive(mockData);
    expect(result.entries).toHaveLength(3);
    expect(result.format).toBe('POSIX PAX');

    const file1 = result.entries[1];
    expect(file1.name).toBe('file1.bin');
    expect(file1.size).toBe(1024);

    const file2 = result.entries[2];
    expect(file2.name).toBe('file2.txt');
    expect(file2.size).toBe(18);
    expect(result.totalSize).toBe(1024 + 18);
  });

  it('applies global PAX size override across entries when raw header sizes differ', () => {
    const globalPaxPayload = '12 size=512\n';
    const file1Data = new Uint8Array(512);
    const file2Data = new Uint8Array(512);

    const mockData = createMockTarArchive([
      {
        name: 'pax_global_header',
        typeflag: TYPE_FLAGS.PAX_GLOBAL,
        content: globalPaxPayload,
      },
      {
        name: 'file1.bin',
        content: file1Data,
        headerSize: 0,
      },
      {
        name: 'file2.bin',
        content: file2Data,
        headerSize: 2048, // Header size differs from actual 512-byte payload & global PAX size
      },
      {
        name: 'file3.txt',
        content: 'third file',
      },
    ]);

    const result = parseTarArchive(mockData);
    expect(result.entries).toHaveLength(4);

    const file1 = result.entries[1];
    expect(file1.name).toBe('file1.bin');
    expect(file1.size).toBe(512);

    const file2 = result.entries[2];
    expect(file2.name).toBe('file2.bin');
    expect(file2.size).toBe(512);

    const file3 = result.entries[3];
    expect(file3.name).toBe('file3.txt');
    expect(file3.size).toBe(512);
  });

  it('validates padded extent and rejects truncated archives using effective PAX size', () => {
    const paxPayload = '13 size=1024\n';
    const file1Data = new Uint8Array(1024);

    const validData = createMockTarArchive([
      {
        name: 'PaxHeader/large.bin',
        typeflag: TYPE_FLAGS.PAX_EXTENDED,
        content: paxPayload,
      },
      {
        name: 'large.bin',
        content: file1Data,
        headerSize: 0, // Raw header claims 0 bytes
      },
    ]);

    // Truncate during the 1024-byte payload (e.g. at header + 500 bytes of payload)
    // PAX header = 512 header + 512 data = 1024 bytes
    // large.bin header = 512 bytes (total 1536 bytes)
    // Truncate to 1536 + 500 = 2036 bytes (missing remainder of 1024-byte payload)
    const truncated = validData.subarray(0, 2036);

    expect(() => parseTarArchive(truncated)).toThrow(TarParseError);
    expect(() => parseTarArchive(truncated)).toThrow(
      /Archive is truncated: entry "large\.bin" data \(1024 bytes\) extends beyond file end/i,
    );
  });

  it('rejects an archive that ends immediately after member data without terminator blocks', () => {
    // 512 header + 512 padded data = 1024 bytes (missing required 2 zero blocks)
    const truncated = createMockTarArchive([{ name: 'a.txt', content: 'a' }]).subarray(0, 1024);

    expect(() => parseTarArchive(truncated)).toThrow(TarParseError);
    expect(() => parseTarArchive(truncated)).toThrow(
      /Archive is truncated: missing two consecutive zero end-of-archive blocks/i,
    );
  });

  it('rejects an archive that ends after only one zero terminator block', () => {
    // 512 header + 512 padded data + 512 one zero block = 1536 bytes (missing 2nd zero block)
    const truncated = createMockTarArchive([{ name: 'a.txt', content: 'a' }]).subarray(0, 1536);

    expect(() => parseTarArchive(truncated)).toThrow(TarParseError);
    expect(() => parseTarArchive(truncated)).toThrow(
      /Archive is truncated: missing two consecutive zero end-of-archive blocks/i,
    );
  });

  it(
    'rejects an archive whose member header specifies a base-256 size ' +
      'exceeding safe integer limits',
    () => {
      const archive = createMockTarArchive([{ name: 'overflow.bin', content: '' }]);
      // In header for overflow.bin (offset 0), set size field (offset 124..136)
      // to 0x81 followed by 11 zeros (2^88)
      const sizeSlice = archive.subarray(124, 136);
      sizeSlice.fill(0);
      sizeSlice[0] = 0x81;

      // Recompute header checksum
      for (let i = 148; i < 156; i += 1) archive[i] = 32;
      let sum = 0;
      for (let i = 0; i < TAR_BLOCK_SIZE; i += 1) sum += archive[i];
      const chkStr = sum.toString(8).padStart(6, '0') + '\0 ';
      archive.set(new TextEncoder().encode(chkStr), 148);

      expect(() => parseTarArchive(archive)).toThrow(TarParseError);
      expect(() => parseTarArchive(archive)).toThrow(/exceeds JavaScript safe integer limit/i);
    },
  );

  it(
    'rejects an archive with overdeclared PAX record length without overriding entry fields',
    () => {
      const archive = createMockTarArchive([
        {
          name: 'PaxHeader/actual.txt',
          typeflag: TYPE_FLAGS.PAX_EXTENDED,
          content: '100 path=x\n',
        },
        {
          name: 'actual.txt',
          content: 'regular file content',
        },
      ]);

      expect(() => parseTarArchive(archive)).toThrow(TarParseError);
      expect(() => parseTarArchive(archive)).toThrow(
        /Malformed PAX record at byte 0: declared length 100 extends beyond payload/i,
      );
    },
  );

  it('rejects an archive with PAX record missing trailing newline', () => {
    const archive = createMockTarArchive([
      {
        name: 'PaxHeader/actual.txt',
        typeflag: TYPE_FLAGS.PAX_EXTENDED,
        content: '10 path=x\0',
      },
      {
        name: 'actual.txt',
        content: 'regular file content',
      },
    ]);

    expect(() => parseTarArchive(archive)).toThrow(TarParseError);
    expect(() => parseTarArchive(archive)).toThrow(
      /Malformed PAX record at byte 0: missing trailing newline/i,
    );
  });
});
