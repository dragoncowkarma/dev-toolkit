import { describe, expect, it } from 'vitest';
import {
  BencodeError,
  bytesToHex,
  compareBytes,
  decodeBencode,
  encodeBencode,
  formatBencodeValue,
} from './bencode.utils.js';

describe('decodeBencode', () => {
  it('decodes integers and byte strings', () => {
    expect(decodeBencode('i-42e')).toBe(-42);
    expect(bytesToHex(decodeBencode('5:hello'))).toBe('68656c6c6f');
  });

  it('decodes nested lists and dictionaries', () => {
    const decoded = decodeBencode('d3:cow3:moo4:spaml1:a1:bee');
    expect(formatBencodeValue(decoded)).toBe(JSON.stringify({
      cow: 'moo',
      spam: ['a', 'b'],
    }, null, 2));
  });

  it('preserves dictionary keys that overlap Object prototype names', () => {
    const decoded = decodeBencode('d9:__proto__4:safee');
    expect(formatBencodeValue(decoded)).toBe('{\n  "__proto__": "safe"\n}');
  });

  it('retains byte strings that are not valid UTF-8', () => {
    const decoded = decodeBencode(Uint8Array.from([50, 58, 255, 0]));
    expect(formatBencodeValue(decoded)).toContain('ff00');
    expect(formatBencodeValue(decoded)).toContain('/wA=');
  });

  it('rejects malformed documents with descriptive errors', () => {
    expect(() => decodeBencode('l4:spam')).toThrow(/Unterminated list/);
    expect(() => decodeBencode('d3:key')).toThrow(/Unterminated dictionary|Unexpected end/);
    expect(() => decodeBencode('x:spam')).toThrow(/Unexpected token/);
    expect(() => decodeBencode('-1:x')).toThrow(/cannot be negative/);
    expect(() => decodeBencode('4spam')).toThrow(/Expected ':'/);
    expect(() => decodeBencode('d3:zoo1:a3:ant1:be')).toThrow(/sorted and unique/);
    expect(() => decodeBencode('d3:foo1:a3:foo1:be')).toThrow(/sorted and unique/);
  });
});

describe('encodeBencode', () => {
  it('sorts dictionary keys by their raw bytes', () => {
    const encoded = encodeBencode({ zoo: 'last', apple: 'first', Zebra: 'middle' });
    expect(new TextDecoder().decode(encoded)).toBe('d5:Zebra6:middle5:apple5:first3:zoo4:laste');
  });

  it('sorts non-ASCII dictionary keys by UTF-8 bytes rather than locale', () => {
    const encoded = encodeBencode({ 'é': 'accent', z: 'ascii' });
    expect(new TextDecoder().decode(encoded)).toBe('d1:z5:ascii2:é6:accente');
  });

  it('round-trips a minimal BitTorrent-style info dictionary', () => {
    const torrent = {
      announce: 'https://tracker.example/announce',
      info: {
        length: 42,
        name: 'sample.txt',
        'piece length': 16384,
        pieces: { $bytes: { hex: 'ff00' } },
      },
    };
    const encoded = encodeBencode(torrent);
    expect(formatBencodeValue(decodeBencode(encoded))).toBe(JSON.stringify({
      announce: 'https://tracker.example/announce',
      info: {
        length: 42,
        name: 'sample.txt',
        'piece length': 16384,
        pieces: { $bytes: { hex: 'ff00', base64: '/wA=' } },
      },
    }, null, 2));
  });

  it('compares raw dictionary keys independently of locale', () => {
    expect(compareBytes(Uint8Array.of(90), Uint8Array.of(97))).toBeLessThan(0);
  });

  it('rejects unsupported values', () => {
    expect(() => encodeBencode(true)).toThrow(BencodeError);
  });
});
