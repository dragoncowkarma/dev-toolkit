import { describe, expect, it } from 'vitest';
import { DISPLAY_ENTRY_CAP, parseGitIndex, readIndexFile } from './gitIndex.utils.js';

function uint32(value) {
  return [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255];
}

function indexFile(version, entries, extensions = []) {
  const body = entries.flat();
  const extensionBytes = extensions.flatMap(({ signature, content }) => [
    ...signature.split('').map((character) => character.charCodeAt(0)),
    ...uint32(content.length),
    ...content,
  ]);
  return Uint8Array.from([
    ...'DIRC'.split('').map((character) => character.charCodeAt(0)),
    ...uint32(version),
    ...uint32(entries.length),
    ...body,
    ...extensionBytes,
    ...Array(20).fill(0xab),
  ]).buffer;
}

function entry(path, options = {}) {
  const flags = (options.flags ?? path.length) | (options.extended ? 0x4000 : 0);
  const fields = [1, 2, 3, 4, 5, 6, options.mode ?? 0o100644, 7, 8, 9];
  const fixed = [...fields.flatMap(uint32), ...Array(20).fill(0x11), flags >> 8, flags & 255];
  if (options.extended) fixed.push(0, 0);
  const named = [...fixed, ...new TextEncoder().encode(path), 0];
  while (named.length % 8 !== 0) named.push(0);
  return named;
}

function v4Entry(prefixLength, suffix) {
  const fields = [1, 2, 3, 4, 5, 6, 0o120000, 7, 8, 9];
  const fixed = [...fields.flatMap(uint32), ...Array(20).fill(0x22), 0, suffix.length];
  return [...fixed, prefixLength, ...new TextEncoder().encode(suffix), 0];
}

describe('parseGitIndex', () => {
  it('parses a version 2 entry and its padded name', () => {
    const parsed = parseGitIndex(indexFile(2, [entry('readme.md')]));
    expect(parsed.versionLabel).toBe('2');
    expect(parsed.entries[0]).toMatchObject({ path: 'readme.md', size: 9 });
    expect(parsed.entries[0].mode).toEqual({ type: 'regular', permissions: '0644' });
    expect(parsed.entries[0].sha1).toBe('11'.repeat(20));
  });

  it('parses version 3 extended flags', () => {
    const parsed = parseGitIndex(indexFile(3, [entry('link', { extended: true, flags: 0x8004 })]));
    expect(parsed.entries[0].flags).toMatchObject({ assumeValid: true, extended: true });
  });

  it('decodes version 4 prefix-compressed paths', () => {
    const parsed = parseGitIndex(indexFile(4, [v4Entry(0, 'src/one.js'), v4Entry(6, 'two.js')]));
    expect(parsed.entries.map((item) => item.path)).toEqual(['src/one.js', 'src/two.js']);
    expect(parsed.entries[0].mode.type).toBe('symlink');
  });

  it('caps displayed entries while preserving the total entry count', () => {
    const entries = Array.from({ length: DISPLAY_ENTRY_CAP + 1 }, (_, index) => entry(`f${index}`));
    const parsed = parseGitIndex(indexFile(2, entries));
    expect(parsed.entryCount).toBe(DISPLAY_ENTRY_CAP + 1);
    expect(parsed.entries).toHaveLength(DISPLAY_ENTRY_CAP);
  });

  it('lists extensions and retains the trailing checksum', () => {
    const parsed = parseGitIndex(indexFile(2, [], [{ signature: 'TREE', content: [1, 2, 3] }]));
    expect(parsed.extensions).toEqual([{ signature: 'TREE', size: 3 }]);
    expect(parsed.checksum).toBe('ab'.repeat(20));
  });

  it('reports bad signatures, short buffers, and truncated entries', () => {
    expect(() => parseGitIndex(new ArrayBuffer(0))).toThrow(/shorter than the 12-byte/);
    const bad = indexFile(2, []);
    new Uint8Array(bad)[0] = 0;
    expect(() => parseGitIndex(bad)).toThrow(/Invalid Git index signature/);
    expect(() => parseGitIndex(indexFile(2, [entry('cut')]).slice(0, -25))).toThrow(/truncated/);
  });
});

describe('readIndexFile', () => {
  it('reports a missing file explicitly', async () => {
    await expect(readIndexFile()).rejects.toThrow('Select a Git index file');
  });
});
