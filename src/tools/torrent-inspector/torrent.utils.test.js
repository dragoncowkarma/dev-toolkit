import { describe, expect, it } from 'vitest';
import { inspectTorrent } from './torrent.utils.js';

const encoder = new TextEncoder();
const bytes = (source) => encoder.encode(source);

describe('inspectTorrent', () => {
  it('inspects a valid single-file torrent and hashes original info bytes', () => {
    const fixture = bytes('d8:announce19:http://tracker.test4:infod6:lengthi12e4:name8:test.txt12:piece lengthi4e6:pieces20:12345678901234567890ee');
    const result = inspectTorrent(fixture);
    expect(result).toMatchObject({
      isMultiFile: false, name: 'test.txt', pieceLength: 4, pieceCount: 1, totalSize: 12,
      infoHash: 'c772f020dcd619b869a6e61c30f3a3b0381ebdfd',
    });
    expect(result.announceUrls).toEqual(['http://tracker.test']);
  });

  it('inspects multi-file paths and tracker tiers', () => {
    const fixture = bytes('d13:announce-listll14:udp://one.testel14:udp://two.testee4:infod5:filesld6:lengthi3e4:pathl3:dir5:a.txteed6:lengthi5e4:pathl3:dir5:b.txteee4:name4:root12:piece lengthi8e6:pieces20:abcdefghijklmnopqrstee');
    const result = inspectTorrent(fixture);
    expect(result.isMultiFile).toBe(true);
    expect(result.files).toEqual([{ path: 'dir/a.txt', size: 3 }, { path: 'dir/b.txt', size: 5 }]);
    expect(result.announceUrls).toEqual(['udp://one.test', 'udp://two.test']);
  });

  it('reports a missing info dictionary', () => {
    expect(() => inspectTorrent(bytes('d8:announce4:teste')))
      .toThrow('Missing required info dictionary');
  });

  it('reports truncated or corrupt bencode input', () => {
    expect(() => inspectTorrent(bytes('d4:infod4:name4:test'))).toThrow(/Unexpected end|Truncated/);
  });

  it('rejects negative zero bencoded integers', () => {
    const fixture = bytes(
      'd4:infod6:lengthi-0e4:name4:test12:piece lengthi4e6:pieces20:12345678901234567890ee',
    );
    expect(() => inspectTorrent(fixture)).toThrow('Invalid bencoded integer.');
  });
});
