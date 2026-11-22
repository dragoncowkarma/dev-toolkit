import { describe, expect, it } from 'vitest';
import { decodeAudioTagByte, decodeVideoTagByte, parseFlv } from './flv-header-inspector.utils.js';

function bytes(...values) {
  return new Uint8Array(values);
}

function validFlv() {
  return bytes(
    0x46, 0x4c, 0x56, 0x01, 0x05, 0x00, 0x00, 0x00, 0x09,
    0x00, 0x00, 0x00, 0x00,
    0x09, 0x00, 0x00, 0x01, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00,
    0x17,
    0x00, 0x00, 0x00, 0x0c,
    0x08, 0x00, 0x00, 0x01, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00, 0x00,
    0xaf,
  );
}

describe('parseFlv', () => {
  it('parses a minimal valid FLV header with video and audio tags', () => {
    const result = parseFlv(validFlv());

    expect(result.diagnostics).toEqual([]);
    expect(result.header).toMatchObject({
      signature: 'FLV', version: 1, hasAudio: true, hasVideo: true, dataOffset: 9,
    });
    expect(result.tags).toHaveLength(2);
    expect(result.tags[0]).toMatchObject({
      previousTagSize: 0, tagType: 'Video', dataSize: 1, timestamp: 1, streamId: 0,
      video: { frameType: 1, codecId: 7, codecLabel: 'AVC' },
    });
    expect(result.tags[1]).toMatchObject({
      previousTagSize: 12, tagType: 'Audio', dataSize: 1, timestamp: 2, streamId: 0,
      audio: { soundFormat: 10, soundFormatLabel: 'AAC', soundRate: '44 kHz' },
    });
  });

  it('reports malformed headers and does not throw', () => {
    expect(() => parseFlv(bytes(0x42, 0x41, 0x44))).not.toThrow();
    const result = parseFlv(bytes(0x42, 0x41, 0x44));
    expect(result.header).toBeNull();
    expect(result.diagnostics[0].message).toMatch(/Truncated FLV header/);
  });

  it('reports a bad signature and unexpected version without discarding readable metadata', () => {
    const input = validFlv();
    input[0] = 0x58;
    input[3] = 2;
    const result = parseFlv(input);

    expect(result.header).toMatchObject({ signature: 'XLV', version: 2 });
    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/Malformed signature/),
        expect.stringMatching(/Unexpected FLV version/),
      ])
    );
  });

  it('reports a declared payload that extends past the remaining file bytes', () => {
    const result = parseFlv(bytes(
      0x46, 0x4c, 0x56, 0x01, 0x00, 0x00, 0x00, 0x00, 0x09,
      0x00, 0x00, 0x00, 0x00,
      0x12, 0x00, 0x00, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x01,
    ));

    expect(result.tags).toHaveLength(1);
    expect(result.diagnostics[0].message).toMatch(/declares 4 payload bytes, but only 1 remain/);
  });

  it('reports truncated PreviousTagSize and tag headers without throwing', () => {
    const truncatedPreviousSize = parseFlv(bytes(
      0x46, 0x4c, 0x56, 0x01, 0x00, 0x00, 0x00, 0x00, 0x09, 0x00,
    ));
    const truncatedHeader = parseFlv(bytes(
      0x46, 0x4c, 0x56, 0x01, 0x00, 0x00, 0x00, 0x00, 0x09,
      0x00, 0x00, 0x00, 0x00, 0x09,
    ));

    expect(truncatedPreviousSize.diagnostics[0].message).toMatch(/Truncated PreviousTagSize/);
    expect(truncatedHeader.diagnostics[0].message).toMatch(/Truncated tag header/);
  });
});

describe('codec header decoders', () => {
  it('decodes video frame and codec values', () => {
    expect(decodeVideoTagByte(0x17)).toMatchObject({
      frameType: 1, frameTypeLabel: 'Key frame', codecId: 7, codecLabel: 'AVC',
    });
  });

  it('decodes audio format, rate, sample size, and channel layout', () => {
    expect(decodeAudioTagByte(0xaf)).toEqual({
      soundFormat: 10,
      soundFormatLabel: 'AAC',
      soundRate: '44 kHz',
      soundSize: '16-bit',
      soundType: 'Stereo',
    });
  });
});
