import { describe, expect, it } from 'vitest';
import { parseId3Tags } from './id3TagInspector.utils.js';

const encoder = new TextEncoder();

function latin(value, length) {
  const bytes = new Uint8Array(length);
  bytes.set(encoder.encode(value).slice(0, length));
  return bytes;
}

function join(...parts) {
  const length = parts.reduce((total, part) => total + part.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  parts.forEach((part) => {
    result.set(part, offset);
    offset += part.length;
  });
  return result;
}

function v23Frame(id, value) {
  const content = join(Uint8Array.of(3), encoder.encode(value));
  const header = new Uint8Array(10);
  header.set(encoder.encode(id));
  new DataView(header.buffer).setUint32(4, content.length);
  return join(header, content);
}

function v23Tag(...frames) {
  const body = join(...frames);
  const header = new Uint8Array(10);
  header.set(encoder.encode('ID3'));
  header[3] = 3;
  const size = body.length;
  header.set([size >>> 21, (size >>> 14) & 0x7f, (size >>> 7) & 0x7f, size & 0x7f], 6);
  return join(header, body);
}

function v1Tag() {
  return join(
    encoder.encode('TAG'), latin('V1 title', 30), latin('V1 artist', 30), latin('V1 album', 30),
    latin('1999', 4), latin('V1 comment', 30), Uint8Array.of(17),
  );
}

function asBuffer(bytes) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

describe('parseId3Tags', () => {
  it('parses a valid ID3v1 trailer', () => {
    const result = parseId3Tags(asBuffer(join(Uint8Array.of(1, 2), v1Tag())));

    expect(result.v1?.version).toBe('1.0');
    expect(result.fields).toMatchObject({
      title: 'V1 title', artist: 'V1 artist', album: 'V1 album', year: '1999',
      comment: 'V1 comment', genre: 'Rock',
    });
  });

  it('parses multiple ID3v2.3 text frames', () => {
    const tag = v23Tag(
      v23Frame('TIT2', 'V2 title'), v23Frame('TPE1', 'V2 artist'), v23Frame('TALB', 'V2 album'),
      v23Frame('TYER', '2026'), v23Frame('TCON', 'Jazz'),
    );
    const result = parseId3Tags(asBuffer(tag));

    expect(result.v2).toMatchObject({ version: '2.3' });
    expect(result.fields).toMatchObject({
      title: 'V2 title', artist: 'V2 artist', album: 'V2 album', year: '2026', genre: 'Jazz',
    });
  });

  it('prefers ID3v2 fields when both supported tag versions exist', () => {
    const result = parseId3Tags(asBuffer(join(v23Tag(v23Frame('TIT2', 'V2 title')), v1Tag())));

    expect(result.v1).not.toBeNull();
    expect(result.v2).not.toBeNull();
    expect(result.fields.title).toBe('V2 title');
    expect(result.fields.artist).toBe('V1 artist');
  });

  it('reports no tag for files without either ID3 marker', () => {
    const result = parseId3Tags(asBuffer(Uint8Array.of(0xff, 0xfb, 0x90, 0x64)));

    expect(result).toMatchObject({ hasTag: false, v1: null, v2: null, fields: {} });
  });

  it('rejects a truncated ID3v2 tag whose declared size exceeds the file', () => {
    const bytes = new Uint8Array([73, 68, 51, 3, 0, 0, 0, 0, 1, 0]);

    expect(() => parseId3Tags(asBuffer(bytes))).toThrow(/declared size exceeds/i);
  });
});
