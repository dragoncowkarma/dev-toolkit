import { describe, expect, it } from 'vitest';
import { parseOpenExr } from './openexr.utils.js';

const string = (value) => [...new TextEncoder().encode(value), 0];
const int = (value) => [value & 255, (value >>> 8) & 255, (value >>> 16) & 255, value >>> 24];
const attribute = (name, type, bytes) => [
  ...string(name), ...string(type), ...int(bytes.length), ...bytes,
];
const float = (value) => {
  const buffer = new ArrayBuffer(4);
  new DataView(buffer).setFloat32(0, value, true);
  return [...new Uint8Array(buffer)];
};
const header = (flags = 0, attrs = []) => new Uint8Array([
  0x76, 0x2f, 0x31, 1, ...int(2 | flags), ...attrs, 0,
  ...(flags & 0x1000 ? [0] : []),
]).buffer;

describe('parseOpenExr', () => {
  it('decodes standard attributes and preserves unknown attributes', () => {
    const channel = [...string('R'), ...int(1), 1, 0, 0, 0, ...int(1), ...int(1), 0];
    const attrs = [
      ...attribute('channels', 'chlist', channel),
      ...attribute('compression', 'compression', [3]),
      ...attribute('dataWindow', 'box2i', [...int(0), ...int(1), ...int(9), ...int(10)]),
      ...attribute('displayWindow', 'box2i', [...int(0), ...int(0), ...int(19), ...int(20)]),
      ...attribute('lineOrder', 'lineOrder', [0]),
      ...attribute('pixelAspectRatio', 'float', float(1)),
      ...attribute('screenWindowWidth', 'float', float(2)),
      ...attribute('other', 'custom', [42]),
    ];
    const result = parseOpenExr(header(0, attrs));
    const values = Object.fromEntries(result.headers[0].map(({ name, value }) => [name, value]));
    expect(result.version).toBe(2);
    expect(values.channels).toEqual([
      { name: 'R', pixelType: 'HALF', linear: true, xSampling: 1, ySampling: 1 },
    ]);
    expect(values.compression).toBe('ZIP');
    expect(values.dataWindow).toEqual({ xMin: 0, yMin: 1, xMax: 9, yMax: 10 });
    expect(values.displayWindow.xMax).toBe(19);
    expect(values.lineOrder).toBe('Increasing Y');
    expect(values.pixelAspectRatio).toBe(1);
    expect(values.screenWindowWidth).toBe(2);
    expect(values.other).toBeNull();
  });

  it('reports bad magic and unsupported versions', () => {
    const bytes = new Uint8Array(header());
    bytes[0] = 0;
    expect(() => parseOpenExr(bytes.buffer)).toThrow(/magic/i);
    bytes[0] = 0x76;
    bytes[4] = 3;
    expect(() => parseOpenExr(bytes.buffer)).toThrow(/unsupported.*version/i);
  });

  it('reports truncation and attributes extending beyond the file', () => {
    expect(() => parseOpenExr(new ArrayBuffer(4))).toThrow(/truncated/i);
    expect(() => parseOpenExr(header().slice(0, 8))).toThrow(/truncated/i);
    const bytes = new Uint8Array([...new Uint8Array(header()).slice(0, 8),
      ...string('x'), ...string('float'), ...int(10), 0]);
    expect(() => parseOpenExr(bytes.buffer)).toThrow(/size runs past/i);
  });

  it('detects tiled and multipart flags and parses multiple parts', () => {
    const first = attribute('compression', 'compression', [0]);
    const second = attribute('lineOrder', 'lineOrder', [1]);
    const buffer = new Uint8Array([
      0x76, 0x2f, 0x31, 1, ...int(2 | 0x1e00), ...first, 0, ...second, 0, 0,
    ]).buffer;
    const result = parseOpenExr(buffer);
    expect(result.flags).toEqual({ tiled: true, longNames: true, nonImage: true, multipart: true });
    expect(result.headers).toHaveLength(2);
    expect(result.headers[1][0].value).toBe('Decreasing Y');
  });
});
