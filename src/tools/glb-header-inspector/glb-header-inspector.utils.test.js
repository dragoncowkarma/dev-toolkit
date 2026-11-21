import { describe, expect, it } from 'vitest';
import { inspectGlbHeader } from './glb-header-inspector.utils.js';

const JSON_TYPE = 0x4e4f534a;
const BIN_TYPE = 0x004e4942;

function padToFour(bytes, padding = 0x20) {
  const padded = new Uint8Array(Math.ceil(bytes.length / 4) * 4);
  padded.fill(padding);
  padded.set(bytes);
  return padded;
}

function makeChunk(type, data) {
  const header = new Uint8Array(8);
  const view = new DataView(header.buffer);
  view.setUint32(0, data.length, true);
  view.setUint32(4, type, true);
  return [header, data];
}

function makeGlb(chunks, options = {}) {
  const content = chunks.flatMap(({ type, data }) => makeChunk(type, data));
  const contentLength = content.reduce((total, item) => total + item.length, 0);
  const bytes = new Uint8Array(12 + contentLength);
  bytes.set(new TextEncoder().encode(options.magic ?? 'glTF'), 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(4, options.version ?? 2, true);
  view.setUint32(8, options.length ?? bytes.length, true);
  let offset = 12;
  for (const item of content) {
    bytes.set(item, offset);
    offset += item.length;
  }
  return bytes.buffer;
}

function jsonChunk(value) {
  return { type: JSON_TYPE, data: padToFour(new TextEncoder().encode(value)) };
}

describe('inspectGlbHeader', () => {
  it('reads a valid GLB with JSON and BIN chunks without exposing BIN data', () => {
    const result = inspectGlbHeader(makeGlb([
      jsonChunk('{"asset":{"version":"2.0","generator":"test"},"meshes":[]}'),
      { type: BIN_TYPE, data: new Uint8Array([1, 2, 3, 4]) },
    ]));

    expect(result.errors).toEqual([]);
    expect(result.chunks).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'JSON' }),
      expect.objectContaining({ type: 'BIN', length: 4 }),
    ]));
    expect(result.jsonMetadata).toEqual({
      topLevelKeys: ['asset', 'meshes'],
      assetVersion: '2.0',
      assetGenerator: 'test',
    });
    expect(result.chunks[1]).not.toHaveProperty('data');
  });

  it('accepts a JSON-only GLB', () => {
    const result = inspectGlbHeader(makeGlb([jsonChunk('{"asset":{"version":"2.0"}}')]));

    expect(result.errors).toEqual([]);
    expect(result.chunks).toHaveLength(1);
    expect(result.chunks[0].type).toBe('JSON');
  });

  it('reports a corrupt or truncated header without reading past EOF', () => {
    const result = inspectGlbHeader(new Uint8Array([0x67, 0x6c, 0x54]).buffer);

    expect(result.header).toBeNull();
    expect(result.errors).toContain('Truncated GLB header: expected 12 bytes, found 3.');
  });

  it('reports a bad magic value', () => {
    const result = inspectGlbHeader(makeGlb([jsonChunk('{"asset":{}}')], { magic: 'nope' }));

    expect(result.errors.join(' ')).toMatch(/Invalid GLB magic/);
  });

  it('reports invalid embedded JSON without throwing', () => {
    const result = inspectGlbHeader(makeGlb([jsonChunk('{not valid}')]))

    expect(result.errors.join(' ')).toMatch(/Unable to parse JSON chunk/);
    expect(result.jsonMetadata).toBeNull();
  });

  it('retains an unrecognized chunk as metadata', () => {
    const result = inspectGlbHeader(makeGlb([
      jsonChunk('{"asset":{}}'),
      { type: 0x12345678, data: new Uint8Array([0, 0, 0, 0]) },
    ]));

    expect(result.chunks[1]).toMatchObject({ type: 'Unrecognized', typeValue: '0x12345678' });
    expect(result.warnings.join(' ')).toMatch(/Unrecognized chunk type/);
  });
});
