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
});
