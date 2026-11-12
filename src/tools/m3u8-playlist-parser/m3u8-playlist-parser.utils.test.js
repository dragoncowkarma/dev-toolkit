import { describe, expect, it } from 'vitest';
import {
  getTotalDuration,
  parseAttributeList,
  parseExtinf,
  parseM3u8Playlist,
} from './m3u8-playlist-parser.utils.js';

const VALID_MEDIA = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:10
#EXT-X-MEDIA-SEQUENCE:12
#EXT-X-KEY:METHOD=AES-128,URI="key.bin"
#EXTINF:9.5,Intro
first.ts
#EXTINF:10,Main feature
second.ts
#EXT-X-ENDLIST`;

describe('M3U8 parsing utilities', () => {
  it('detects and parses a valid media playlist', () => {
    const result = parseM3u8Playlist(VALID_MEDIA);

    expect(result.type).toBe('Media');
    expect(result.segments).toHaveLength(2);
    expect(result.segments[0]).toMatchObject({ uri: 'first.ts', duration: 9.5, title: 'Intro' });
    expect(result.segments[0].key).toMatchObject({ METHOD: 'AES-128', URI: 'key.bin' });
    expect(result.errors).toEqual([]);
    expect(getTotalDuration(result.segments)).toBe(19.5);
  });

  it('detects a master playlist and parses variant attributes', () => {
    const result = parseM3u8Playlist(`#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=1280000,RESOLUTION=1280x720,CODECS="avc1,mp4a",AUDIO="main"
low.m3u8`);

    expect(result.type).toBe('Master');
    expect(result.variants[0]).toMatchObject({
      uri: 'low.m3u8',
      attributes: { BANDWIDTH: '1280000', RESOLUTION: '1280x720', CODECS: 'avc1,mp4a' },
    });
  });

  it('reports a missing EXTM3U header and an orphan segment URI', () => {
    const result = parseM3u8Playlist('#EXTINF:5,No header\nsegment.ts');

    expect(result.errors.map((issue) => issue.message)).toEqual(expect.arrayContaining([
      '#EXTM3U must be the first line of the playlist.',
    ]));
  });

  it('reports a missing BANDWIDTH attribute and a missing variant URI', () => {
    const result = parseM3u8Playlist('#EXTM3U\n#EXT-X-STREAM-INF:RESOLUTION=1280x720');
    const messages = result.errors.map((issue) => issue.message);

    expect(messages).toContain('BANDWIDTH is required on #EXT-X-STREAM-INF.');
    expect(messages).toContain('#EXT-X-STREAM-INF must be immediately followed by a variant URI.');
  });

  it('reports invalid media playlist samples', () => {
    const result = parseM3u8Playlist(`#EXTM3U
#EXT-X-TARGETDURATION:5
#EXTINF:-1,Invalid
bad.ts
#EXTINF:6,Too long
long.ts
orphan.ts`);
    const messages = result.errors.map((issue) => issue.message);

    expect(messages).toContain('#EXTINF duration must be a non-negative number.');
    expect(messages).toContain('Every segment URI must be preceded by #EXTINF.');
    expect(result.warnings[0].message).toContain('exceeds TARGETDURATION 5');
  });

  it('parses standalone EXTINF and attribute-list syntax', () => {
    expect(parseExtinf('6.25, Name')).toEqual({ duration: 6.25, title: 'Name', valid: true });
    expect(parseAttributeList('BANDWIDTH=1,CODECS="avc1,mp4a"')).toEqual({
      BANDWIDTH: '1', CODECS: 'avc1,mp4a',
    });
  });
});
