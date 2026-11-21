import { describe, expect, it } from 'vitest';
import { parseQoiHeader } from './qoiHeaderInspector.utils.js';

const END_MARKER = [0, 0, 0, 0, 0, 0, 0, 1];

function createQoi(
  { width = 1, height = 1, channels = 3, colorspace = 0, endMarker = END_MARKER } = {}
) {
  const bytes = new Uint8Array(14 + endMarker.length);
  bytes.set([0x71, 0x6f, 0x69, 0x66]);
  const view = new DataView(bytes.buffer);
  view.setUint32(4, width, false);
  view.setUint32(8, height, false);
  bytes[12] = channels;
  bytes[13] = colorspace;
  bytes.set(endMarker, 14);
  return bytes;
}

describe('parseQoiHeader', () => {
  it('parses a minimal RGB QOI header with the sRGB colorspace', () => {
    const result = parseQoiHeader(createQoi({ width: 12, height: 34 }));

    expect(result).toMatchObject({
      error: '',
      warnings: [],
      header: {
        magic: 'qoif',
        width: 12,
        height: 34,
        channels: 3,
        channelsDescription: 'RGB',
        colorspace: 0,
        colorspaceDescription: 'sRGB with linear alpha',
        endMarkerPresent: true,
      },
    });
  });

  it('parses RGBA with all-linear colorspace', () => {
    const result = parseQoiHeader(createQoi({ channels: 4, colorspace: 1 }));

    expect(result.error).toBe('');
    expect(result.warnings).toEqual([]);
    expect(result.header).toMatchObject({
      channelsDescription: 'RGBA',
      colorspaceDescription: 'All channels linear',
    });
  });

  it('reports bad or missing magic as an error', () => {
    const invalid = createQoi();
    invalid[0] = 0;

    expect(parseQoiHeader(invalid).error).toMatch(/magic bytes/);
  });

  it('reports a truncated header as an error', () => {
    expect(parseQoiHeader(new Uint8Array(13)).error).toMatch(/at least 22 bytes/);
  });

  it('warns when the required end marker is missing', () => {
    const result = parseQoiHeader(createQoi({ endMarker: new Array(8).fill(0) }));

    expect(result.error).toBe('');
    expect(result.header.endMarkerPresent).toBe(false);
    expect(result.warnings).toContain('The required QOI end marker is missing or invalid.');
  });
});
