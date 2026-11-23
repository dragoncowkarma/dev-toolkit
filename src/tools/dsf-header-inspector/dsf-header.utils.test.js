import { describe, expect, it } from 'vitest';
import { parseDsfHeader } from './dsf-header.utils.js';

function createDsf({ metadataPointer = 0, dsdChunkSize = 28, magic = 'DSD ' } = {}) {
  const dataChunkSize = 12 + 16;
  const buffer = new ArrayBuffer(80 + dataChunkSize);
  const view = new DataView(buffer);
  writeMagic(view, 0, magic);
  view.setBigUint64(4, BigInt(dsdChunkSize), true);
  view.setBigUint64(12, BigInt(buffer.byteLength), true);
  view.setBigUint64(20, BigInt(metadataPointer), true);
  writeMagic(view, 28, 'fmt ');
  view.setBigUint64(32, 52n, true);
  view.setUint32(40, 1, true);
  view.setUint32(44, 0, true);
  view.setUint32(48, 2, true);
  view.setUint32(52, 2, true);
  view.setUint32(56, 2822400, true);
  view.setUint32(60, 1, true);
  view.setBigUint64(64, 5644800n, true);
  view.setUint32(72, 4096, true);
  view.setUint32(76, 0, true);
  writeMagic(view, 80, 'data');
  view.setBigUint64(84, BigInt(dataChunkSize), true);
  return buffer;
}

function writeMagic(view, offset, value) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

describe('parseDsfHeader', () => {
  it('parses a valid stereo DSD64 header', () => {
    const parsed = parseDsfHeader(createDsf());

    expect(parsed.channelCount).toBe(2);
    expect(parsed.samplingFrequency).toBe(2822400);
    expect(parsed.bitsPerSample).toBe(1);
    expect(parsed.sampleCount).toBe(5644800);
    expect(parsed.blockSizePerChannel).toBe(4096);
    expect(parsed.audioPayloadSize).toBe(16);
    expect(parsed.durationSeconds).toBe(2);
  });

  it('parses a valid metadata pointer', () => {
    const parsed = parseDsfHeader(createDsf({ metadataPointer: 90 }));

    expect(parsed.metadataPointer).toBe(90);
  });

  it('rejects truncated input', () => {
    expect(() => parseDsfHeader(new ArrayBuffer(16))).toThrow(/Truncated DSD header/);
  });

  it('rejects an invalid DSD magic value', () => {
    expect(() => parseDsfHeader(createDsf({ magic: 'NOPE' }))).toThrow(/Invalid DSD header magic/);
  });

  it('rejects an invalid DSD chunk size', () => {
    expect(() => parseDsfHeader(createDsf({ dsdChunkSize: 24 }))).toThrow(/Invalid DSD chunk size/);
  });
});
