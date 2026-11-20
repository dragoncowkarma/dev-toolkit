import { describe, expect, it } from 'vitest';
import { parseTarArchive } from './tar-header-inspector.utils.js';

const encoder = new TextEncoder();

function writeText(bytes, offset, length, value) {
  bytes.set(encoder.encode(value).slice(0, length), offset);
}

function writeOctal(bytes, offset, length, value) {
  writeText(bytes, offset, length, `${value.toString(8).padStart(length - 1, '0')}\0`);
}

function checksum(header) {
  let result = 0;
  for (let index = 0; index < 512; index += 1) {
    result += index >= 148 && index < 156 ? 32 : header[index];
  }
  return result;
}

function tarEntry({ name = 'file.txt', size = 0, typeflag = '0', data = '', magic = true } = {}) {
  const header = new Uint8Array(512);
  writeText(header, 0, 100, name);
  writeOctal(header, 100, 8, 0o644);
  writeOctal(header, 108, 8, 1000);
  writeOctal(header, 116, 8, 1000);
  writeOctal(header, 124, 12, size);
  writeOctal(header, 136, 12, 1_700_000_000);
  writeText(header, 156, 1, typeflag);
  if (magic) {
    writeText(header, 257, 6, 'ustar\0');
    writeText(header, 263, 2, '00');
    writeText(header, 265, 32, 'tester');
  }
  writeOctal(header, 148, 8, checksum(header));
  const content = encoder.encode(data);
  const padded = new Uint8Array(Math.ceil(size / 512) * 512);
  padded.set(content.slice(0, size));
  return [header, padded];
}

function archive(...parts) {
  const bytes = new Uint8Array(parts.reduce((size, part) => size + part.length, 1024));
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.length;
  }
  return bytes;
}

function paxRecord(key, value) {
  const record = ` ${key}=${value}\n`;
  let length = encoder.encode(record).length + 1;
  while (true) {
    const next = `${length}${record}`;
    if (encoder.encode(next).length === length) return next;
    length = encoder.encode(next).length;
  }
}

describe('parseTarArchive', () => {
  it('parses a valid ustar header and detects the two-block terminator', () => {
    const [header, data] = tarEntry({ name: 'folder/file.txt', size: 3, data: 'abc' });
    const parsed = parseTarArchive(archive(header, data));

    expect(parsed.endOfArchive).toBe(true);
    expect(parsed.entries).toHaveLength(1);
    expect(parsed.entries[0]).toMatchObject({
      name: 'folder/file.txt', size: 3, format: 'ustar (POSIX.1-1988)', checksumValid: true,
    });
  });

  it.each([
    ['0', 'Regular file'], ['1', 'Hard link'], ['2', 'Symbolic link'], ['3', 'Character device'],
    ['4', 'Block device'], ['5', 'Directory'], ['6', 'FIFO'], ['7', 'Contiguous file'],
  ])('labels typeflag %s as %s', (typeflag, type) => {
    const [header, data] = tarEntry({ typeflag });
    expect(parseTarArchive(archive(header, data)).entries[0].type).toBe(type);
  });

  it('applies PAX path metadata to the following entry', () => {
    const pax = paxRecord('path', 'a/very/long/path.txt');
    const [paxHeader, paxData] = tarEntry({
      name: 'PaxHeader', typeflag: 'x', size: pax.length, data: pax,
    });
    const [fileHeader, fileData] = tarEntry({ name: 'short.txt' });
    const parsed = parseTarArchive(archive(paxHeader, paxData, fileHeader, fileData));

    expect(parsed.entries[0].pax.path).toBe('a/very/long/path.txt');
    expect(parsed.entries[1].name).toBe('a/very/long/path.txt');
  });

  it('applies GNU long-name data to the following entry', () => {
    const longName = 'a/'.repeat(60) + 'file.txt';
    const [longHeader, longData] = tarEntry({
      name: '././@LongLink', typeflag: 'L', size: longName.length, data: longName,
    });
    const [fileHeader, fileData] = tarEntry({ name: 'short.txt' });
    expect(parseTarArchive(archive(longHeader, longData, fileHeader, fileData)).entries[1].name)
      .toBe(longName);
  });

  it('rejects invalid checksums, malformed octal values, and truncated headers', () => {
    const [invalidChecksum] = tarEntry();
    invalidChecksum[0] ^= 1;
    expect(() => parseTarArchive(archive(invalidChecksum))).toThrow('Invalid checksum');

    const [malformed] = tarEntry();
    malformed[124] = 56;
    writeOctal(malformed, 148, 8, checksum(malformed));
    expect(() => parseTarArchive(archive(malformed))).toThrow('Malformed size');
    expect(() => parseTarArchive(new Uint8Array(511))).toThrow('Truncated TAR header');
  });
});
