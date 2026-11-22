import { describe, expect, it } from 'vitest';
import { parseDdsHeader } from './dds-header.utils.js';

function makeHeader({ dx10 = false } = {}) {
  const bytes = new Uint8Array(dx10 ? 148 : 128);
  const view = new DataView(bytes.buffer);
  bytes.set([0x44, 0x44, 0x53, 0x20]);
  view.setUint32(4, 124, true);
  view.setUint32(8, 0x100f, true);
  view.setUint32(12, 256, true);
  view.setUint32(16, 512, true);
  view.setUint32(20, 2048, true);
  view.setUint32(24, 1, true);
  view.setUint32(28, 5, true);
  view.setUint32(76, 32, true);
  view.setUint32(80, 0x4, true);
  view.setUint32(84, dx10 ? 0x30315844 : 0x31545844, true);
  view.setUint32(88, 32, true);
  view.setUint32(92, 0x00ff0000, true);
  view.setUint32(96, 0x0000ff00, true);
  view.setUint32(100, 0x000000ff, true);
  view.setUint32(104, 0xff000000, true);
  view.setUint32(108, 0x401008, true);
  view.setUint32(112, 0x200, true);
  if (dx10) {
    view.setUint32(128, 98, true);
    view.setUint32(132, 3, true);
    view.setUint32(136, 4, true);
    view.setUint32(140, 6, true);
    view.setUint32(144, 1, true);
  }
  return bytes;
}

describe('parseDdsHeader', () => {
  it('parses a valid classic DDS header', () => {
    const result = parseDdsHeader(makeHeader());

    expect(result).toMatchObject({
      ok: true,
      header: {
        width: 512,
        height: 256,
        mipMapCount: 5,
        pixelFormat: { fourCC: { hex: '0x31545844', ascii: 'DXT1' } },
        caps: 0x401008,
        caps2: 0x200,
      },
    });
  });

  it('parses the optional DX10 extension', () => {
    const result = parseDdsHeader(makeHeader({ dx10: true }));

    expect(result).toMatchObject({
      ok: true,
      header: {
        pixelFormat: { fourCC: { ascii: 'DX10' } },
        dx10: { dxgiFormat: 98, dxgiFormatName: 'BC7_UNORM', arraySize: 6 },
      },
    });
  });

  it('returns an error for invalid DDS magic', () => {
    const bytes = makeHeader();
    bytes[0] = 0;

    expect(parseDdsHeader(bytes)).toEqual({
      ok: false,
      error: 'Invalid DDS magic. Expected "DDS ".',
    });
  });

  it('returns an error instead of throwing for a truncated buffer', () => {
    expect(parseDdsHeader(new Uint8Array(127))).toEqual({
      ok: false,
      error: 'DDS data is truncated; a complete header needs 128 bytes.',
    });
  });
});
