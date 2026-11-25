import { describe, expect, it } from 'vitest';
import { inspectAdfs } from './adfs.utils.js';

function put(data, offset, value, count) {
  for (let i = 0; i < count; i += 1) data[offset + i] = Math.floor(value / 256 ** i) % 256;
}
function sign(data, offset, length, initial) {
  let sum = initial;
  for (let i = length - 2; i >= 0; i -= 1) sum = (sum & 255) + (sum >> 8) + data[offset + i];
  data[offset + length - 1] = sum & 255;
}
function oldImage() {
  const data = new Uint8Array(512);
  put(data, 252, 800, 3); put(data, 0, 10, 3); put(data, 256, 100, 3);
  data[510] = 3; data[509] = 2; put(data, 507, 1234, 2);
  sign(data, 0, 256, 255); sign(data, 256, 256, 255);
  return data;
}
describe('ADFS inspection', () => {
  it('parses a new-map boot record', () => {
    const data = new Uint8Array(4096); const p = 0xdc0;
    data.set([10, 5, 2, 4, 15, 10, 2, 1, 0, 1], p);
    put(data, p + 16, 819200, 4); put(data, p + 20, 42, 2);
    data.set(new TextEncoder().encode('TestDisc  '), p + 22);
    sign(data, 0xc00, 512, 0);
    expect(inspectAdfs(data)).toMatchObject({ format: 'New map (boot record)',
      discSize: 819200, discId: 42, discName: 'TestDisc', bootChecksum: 'Valid',
      mapChecksums: ['Unknown', 'Unknown'] });
  });
  it('parses old map extents and verifies both sectors', () => {
    expect(inspectAdfs(oldImage())).toMatchObject({ format: 'Old map', discSize: 204800,
      extents: [{ start: 10, length: 100 }], mapChecksums: ['Valid', 'Valid'] });
  });
  it('reports a bad checksum', () => {
    const data = oldImage(); data[20] ^= 1;
    expect(inspectAdfs(data).mapChecksums).toEqual(['Invalid', 'Valid']);
  });
  it('handles truncated and implausible data', () => {
    expect(inspectAdfs(new Uint8Array(2))).toMatchObject({ format: 'Unknown',
      mapChecksums: ['Unknown', 'Unknown'] });
    const data = oldImage(); data[510] = 255;
    expect(inspectAdfs(data).format).toBe('Unknown');
  });
});
