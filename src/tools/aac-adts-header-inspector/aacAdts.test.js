import { describe, expect, it } from 'vitest';
import { parseAdtsStream } from './aacAdts.utils.js';

function createFrame({
  frameLength = 10,
  mpeg2 = false,
  protectionAbsent = true,
  profile = 1,
  samplingIndex = 4,
  channels = 2,
  bufferFullness = 0x7ff,
  rawDataBlocks = 0,
} = {}) {
  const headerLength = protectionAbsent ? 7 : 9;
  const bytes = new Uint8Array(frameLength);
  bytes[0] = 0xff;
  bytes[1] = 0xf0 | (mpeg2 ? 0x08 : 0) | (protectionAbsent ? 1 : 0);
  bytes[2] = (profile << 6) | (samplingIndex << 2) | (channels >> 2);
  bytes[3] = ((channels & 0x03) << 6) | ((frameLength >> 11) & 0x03);
  bytes[4] = (frameLength >> 3) & 0xff;
  bytes[5] = ((frameLength & 0x07) << 5) | ((bufferFullness >> 6) & 0x1f);
  bytes[6] = ((bufferFullness & 0x3f) << 2) | rawDataBlocks;
  for (let index = headerLength; index < bytes.length; index += 1) bytes[index] = index;
  return bytes;
}

describe('parseAdtsStream', () => {
  it('decodes a valid AAC LC stereo frame', () => {
    const result = parseAdtsStream(createFrame());

    expect(result.status).toBe('decoded');
    expect(result.frames).toHaveLength(1);
    expect(result.frames[0]).toMatchObject({
      mpegVersion: 'MPEG-4', profile: 'AAC LC', samplingFrequency: 44100,
      channelCount: 2, frameLength: 10, bufferFullness: 0x7ff, rawDataBlocks: 0,
    });
  });

  it('enumerates every frame in a multi-frame stream', () => {
    const first = createFrame({ frameLength: 9 });
    const second = createFrame({
      frameLength: 12,
      samplingIndex: 3,
      channels: 6,
      rawDataBlocks: 1,
    });
    const stream = new Uint8Array(first.length + second.length);
    stream.set(first);
    stream.set(second, first.length);

    const result = parseAdtsStream(stream);

    expect(result.status).toBe('decoded');
    expect(result.frames).toHaveLength(2);
    expect(result.frames[1]).toMatchObject({
      offset: 9,
      samplingFrequency: 48000,
      channelCount: 6,
      rawDataBlocks: 1,
    });
  });

  it('returns an undecoded result for truncated or malformed input', () => {
    expect(parseAdtsStream(new Uint8Array([0xff, 0xf1, 0x50]))).toMatchObject({
      status: 'undecoded',
    });
    expect(parseAdtsStream(new Uint8Array([0, 1, 2, 3, 4, 5, 6]))).toMatchObject({
      status: 'undecoded',
    });
    expect(parseAdtsStream(createFrame({ frameLength: 20 }).slice(0, 12))).toMatchObject({
      status: 'undecoded',
    });
  });

  it('decodes non-default sample rates and channel configurations', () => {
    const result = parseAdtsStream(createFrame({ samplingIndex: 8, channels: 1, mpeg2: true }));

    expect(result.status).toBe('decoded');
    expect(result.frames[0]).toMatchObject({
      mpegVersion: 'MPEG-2', samplingFrequency: 16000, channelCount: 1, channelLayout: 'Mono',
    });
  });
});
