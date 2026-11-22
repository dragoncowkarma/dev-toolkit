import { describe, expect, it } from 'vitest';
import { decodeFlags, formatVersion, parseWavpackHeader } from './wavpackHeaderInspector.utils.js';

function fourCC(value) {
  return [...value].map((character) => character.charCodeAt(0));
}

function uint16(value) {
  return [value & 0xff, (value >> 8) & 0xff];
}

function uint32(value) {
  return [value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, (value >> 24) & 0xff];
}

function wavpackBlock({
  ckSize = 24,
  version = 0x0410,
  trackNo = 0,
  indexNo = 0,
  totalSamples = 44100,
  blockIndex = 0,
  blockSamples = 44100,
  flags = 0,
  crc = 0xdeadbeef,
  payload = [],
} = {}) {
  const bytes = [
    ...fourCC('wvpk'),
    ...uint32(ckSize),
    ...uint16(version),
    trackNo & 0xff,
    indexNo & 0xff,
    ...uint32(totalSamples),
    ...uint32(blockIndex),
    ...uint32(blockSamples),
    ...uint32(flags),
    ...uint32(crc),
    ...payload,
  ];
  return new Uint8Array(bytes).buffer;
}

describe('parseWavpackHeader', () => {
  it('parses a valid WavPack 4.x block header', () => {
    const result = parseWavpackHeader(wavpackBlock());
    expect(result.valid).toBe(true);
    expect(result.signature).toBe('wvpk');
    expect(result.versionLabel).toBe('4.16');
    expect(result.totalSamples).toBe(44100);
    expect(result.totalSamplesLabel).toBe('44100');
    expect(result.blockSamples).toBe(44100);
    expect(result.crc).toBe(0xdeadbeef);
    expect(result.warnings).toEqual([]);
  });

  it('decodes stereo and bytes-per-sample flags for a standard 16-bit stereo block', () => {
    const flags = 0x2 | 0x0; // bytes_stored=2 (3 bytes/sample), not mono
    const result = parseWavpackHeader(wavpackBlock({ flags }));
    expect(result.flags.bytesPerSample).toBe(3);
    expect(result.flags.channelMode).toBe('Stereo');
    expect(result.flags.isMono).toBe(false);
    expect(result.flags.isFloatData).toBe(false);
  });

  it('decodes mono and multichannel-related flags', () => {
    const monoFlags = 0x4; // MONO_FLAG
    const monoResult = parseWavpackHeader(wavpackBlock({ flags: monoFlags }));
    expect(monoResult.flags.channelMode).toBe('Mono');
    expect(monoResult.flags.isMono).toBe(true);

    const falseStereoFlags = 0x40000000; // FALSE_STEREO_FLAG
    const falseStereoResult = parseWavpackHeader(wavpackBlock({ flags: falseStereoFlags }));
    expect(falseStereoResult.flags.channelMode).toBe('False stereo (shared channel data)');
    expect(falseStereoResult.flags.isFalseStereo).toBe(true);
  });

  it('decodes float data and hybrid mode flags', () => {
    const flags = 0x80 | 0x8; // FLOAT_DATA_FLAG | HYBRID_FLAG
    const result = parseWavpackHeader(wavpackBlock({ flags }));
    expect(result.flags.isFloatData).toBe(true);
    expect(result.flags.isHybrid).toBe(true);
  });

  it('decodes the sample rate index into an actual sampling rate', () => {
    const sampleRateIndex = 10; // 48000 Hz
    const flags = sampleRateIndex << 23;
    const result = parseWavpackHeader(wavpackBlock({ flags }));
    expect(result.flags.sampleRateIndex).toBe(10);
    expect(result.flags.sampleRate).toBe(48000);
    expect(result.flags.sampleRateLabel).toBe('48000 Hz');
  });

  it('decodes the highest sample rate index (15) as 192000 Hz', () => {
    const sampleRateIndex = 15;
    const flags = sampleRateIndex << 23;
    const result = parseWavpackHeader(wavpackBlock({ flags }));
    expect(result.flags.sampleRateIndex).toBe(15);
    expect(result.flags.sampleRate).toBe(192000);
    expect(result.flags.sampleRateLabel).toBe('192000 Hz');
  });

  it('represents an unknown total sample count as -1 with a readable label', () => {
    const result = parseWavpackHeader(wavpackBlock({ totalSamples: 0xffffffff }));
    expect(result.totalSamples).toBe(-1);
    expect(result.totalSamplesLabel).toBe('Unknown');
  });

  it('returns a structured error for input shorter than the 32-byte header', () => {
    const bytes = new Uint8Array(wavpackBlock()).slice(0, 10);
    const result = parseWavpackHeader(bytes.buffer);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/too short/);
  });

  it('returns a structured error for an invalid magic signature', () => {
    const bytes = new Uint8Array(wavpackBlock());
    bytes.set(fourCC('NOPE'), 0);
    const result = parseWavpackHeader(bytes.buffer);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/Invalid WavPack file/);
  });

  it('reports a warning instead of throwing when the block payload is truncated', () => {
    const bytes = new Uint8Array(wavpackBlock({ ckSize: 1000 }));
    const result = parseWavpackHeader(bytes.buffer);
    expect(result.valid).toBe(true);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatch(/truncated/);
  });

  it('never throws for malformed input, even for non-ArrayBuffer values', () => {
    expect(() => parseWavpackHeader(null)).not.toThrow();
    expect(parseWavpackHeader(null).valid).toBe(false);
  });
});

describe('formatVersion', () => {
  it('formats a 16-bit version field as major.minor', () => {
    expect(formatVersion(0x0410)).toBe('4.16');
    expect(formatVersion(0x0402)).toBe('4.2');
  });
});

describe('decodeFlags', () => {
  it('decodes bytes-per-sample from the low two bits', () => {
    expect(decodeFlags(0x0).bytesPerSample).toBe(1);
    expect(decodeFlags(0x1).bytesPerSample).toBe(2);
    expect(decodeFlags(0x3).bytesPerSample).toBe(4);
  });
});
