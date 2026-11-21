import { describe, expect, it } from 'vitest';
import { parseCpioArchive } from './cpio.utils.js';

const encoder = new TextEncoder();

function newcEntry(name, options = {}) {
  const nameBytes = encoder.encode(`${name}\0`);
  const content = encoder.encode(options.content ?? '');
  const fields = [
    options.inode ?? 1, options.mode ?? 0o100644, options.uid ?? 1000, options.gid ?? 1000,
    options.nlink ?? 1, options.mtime ?? 0, content.length, 0, 0, 0, 0, nameBytes.length,
    options.checksum ?? 0,
  ];
  const fieldText = fields.map((value) => value.toString(16).padStart(8, '0')).join('');
  const header = encoder.encode(`${options.magic ?? '070701'}${fieldText}`);
  const namePadding = (4 - ((110 + nameBytes.length) % 4)) % 4;
  const paddedName = new Uint8Array(nameBytes.length + namePadding);
  paddedName.set(nameBytes);
  const paddedContent = new Uint8Array(content.length + ((4 - (content.length % 4)) % 4));
  paddedContent.set(content);
  return Uint8Array.from([...header, ...paddedName, ...paddedContent]);
}

function archive(...entries) {
  return Uint8Array.from(entries.flatMap((entry) => [...entry]));
}

function odcEntry(name) {
  const nameBytes = encoder.encode(`${name}\0`);
  const fields = [0, 1, 0o100644, 1000, 1000, 1, 0]
    .map((value) => value.toString(8).padStart(6, '0'));
  const header = `070707${fields.join('')}${'0'.padStart(11, '0')}`
    + `${nameBytes.length.toString(8).padStart(6, '0')}${'0'.padStart(11, '0')}`;
  return Uint8Array.from([...encoder.encode(header), ...nameBytes]);
}

describe('parseCpioArchive', () => {
  it('parses a minimal newc archive with an entry and trailer', () => {
    const input = archive(newcEntry('hello.txt', { content: 'hi' }), newcEntry('TRAILER!!!'));
    const result = parseCpioArchive(input);
    expect(result).toMatchObject({ format: 'newc', trailerFound: true });
    expect(result.entries).toHaveLength(2);
    expect(result.entries[0]).toMatchObject({
      name: 'hello.txt',
      filesize: 2,
      type: 'Regular file',
    });
  });

  it('walks multiple newc entries using name and content padding', () => {
    const input = archive(
      newcEntry('one', { content: 'x' }),
      newcEntry('two', { content: 'abcde' }),
      newcEntry('TRAILER!!!'),
    );
    const result = parseCpioArchive(input);
    expect(result.entries.map((entry) => entry.name)).toEqual(['one', 'two', 'TRAILER!!!']);
    expect(result.entries[1].filesize).toBe(5);
  });

  it('detects the legacy odc magic variant', () => {
    const result = parseCpioArchive(archive(odcEntry('TRAILER!!!')));
    expect(result.format).toBe('odc (legacy ASCII)');
    expect(result.entries[0].checksum).toBeNull();
  });

  it('rejects an unknown magic value', () => {
    expect(() => parseCpioArchive(encoder.encode('notcpio'))).toThrow('Unsupported CPIO magic');
  });

  it('rejects a truncated or malformed archive without leaking a range error', () => {
    const truncatedArchive = newcEntry('broken').subarray(0, 112);
    expect(() => parseCpioArchive(truncatedArchive)).toThrow('Malformed CPIO archive');
  });
});
