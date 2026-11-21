import { describe, expect, it } from 'vitest';
import { formatArMode, parseArArchive } from './ar-header-inspector.utils.js';

const encoder = new TextEncoder();

function archiveMember({ name, data = '', mtime = 0, uid = 0, gid = 0, mode = '100644' }) {
  const payload = typeof data === 'string' ? encoder.encode(data) : data;
  const header = [
    name.padEnd(16, ' '),
    String(mtime).padEnd(12, ' '),
    String(uid).padEnd(6, ' '),
    String(gid).padEnd(6, ' '),
    mode.padEnd(8, ' '),
    String(payload.length).padEnd(10, ' '),
    '`\n',
  ].join('');
  const parts = [encoder.encode(header), payload];
  if (payload.length % 2 === 1) parts.push(encoder.encode('\n'));
  return parts;
}

function archive(...members) {
  const parts = [encoder.encode('!<arch>\n'), ...members.flat()];
  return Uint8Array.from(parts.flatMap((part) => [...part]));
}

describe('parseArArchive', () => {
  it('parses regular archive member headers', () => {
    const result = parseArArchive(archive(
      archiveMember({ name: 'hello.o/', data: 'abc', mtime: 42 }),
    ));

    expect(result.members).toEqual([
      { name: 'hello.o', size: 3, mode: 0o100644, mtime: 42, uid: 0, gid: 0 },
    ]);
  });

  it('resolves GNU long filename table references', () => {
    const result = parseArArchive(archive(
      archiveMember({ name: '//', data: 'a-very-long-member-name.o/\n' }),
      archiveMember({ name: '/0', data: 'body' }),
    ));

    expect(result.members).toEqual([
      expect.objectContaining({ name: 'a-very-long-member-name.o', size: 4 }),
    ]);
  });

  it('reads BSD extended names from the member body', () => {
    const name = 'folder/long-name.o';
    const result = parseArArchive(archive(archiveMember({
      name: `#1/${name.length}`,
      data: `${name}payload`,
    })));

    expect(result.members).toEqual([
      expect.objectContaining({ name, size: 7 }),
    ]);
  });

  it('returns an error instead of reading beyond malformed or truncated input', () => {
    expect(() => parseArArchive(encoder.encode('!<arch>\nshort')))
      .toThrow(/Truncated archive member header/);
    expect(() => parseArArchive(encoder.encode('not-an-ar'))).toThrow(/expected !<arch> magic/);
    const truncatedArchive = archive(archiveMember({ name: 'file/', data: 'abc' })).slice(0, -1);
    expect(() => parseArArchive(truncatedArchive))
      .toThrow(/Truncated archive member padding/);
  });
});

describe('formatArMode', () => {
  it('formats modes as padded octal values', () => {
    expect(formatArMode(0o644)).toBe('0644');
  });
});
