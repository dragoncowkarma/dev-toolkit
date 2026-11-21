import { describe, expect, it } from 'vitest';
import { parseRpmHeader } from './rpm-header.utils.js';

function uint32(value) {
  return [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255];
}

function stringBytes(value) {
  return [...new TextEncoder().encode(value), 0];
}

function makeHeader(tags) {
  const data = [];
  const index = [];
  for (const [tag, value] of tags) {
    const offset = data.length;
    data.push(...stringBytes(value));
    index.push(...uint32(tag), ...uint32(6), ...uint32(offset), ...uint32(1));
  }
  return Uint8Array.from([
    0x8e, 0xad, 0xe8, 0x01, 0, 0, 0, 0,
    ...uint32(tags.length), ...uint32(data.length), ...index, ...data,
  ]);
}

function makeLead(name = 'example') {
  const lead = new Uint8Array(96);
  lead.set([0xed, 0xab, 0xee, 0xdb, 3, 0, 0, 0, 0, 1], 0);
  lead.set(stringBytes(name), 10);
  lead.set([0, 1, 0, 5], 76);
  return lead;
}

function makeRpm({ signatureTags = [], headerTags = [] } = {}) {
  const lead = makeLead();
  const signature = makeHeader(signatureTags);
  const padding = new Uint8Array((8 - ((lead.length + signature.length) % 8)) % 8);
  const header = makeHeader(headerTags);
  const file = new Uint8Array(lead.length + signature.length + padding.length + header.length);
  file.set(lead);
  file.set(signature, lead.length);
  file.set(header, lead.length + signature.length + padding.length);
  return file;
}

describe('parseRpmHeader', () => {
  it('parses a minimal RPM lead and main header metadata', () => {
    const rpm = makeRpm({
      headerTags: [[1000, 'demo'], [1001, '1.2.3'], [1002, '4'], [1022, 'x86_64']],
    });

    const result = parseRpmHeader(rpm);

    expect(result.lead).toMatchObject({ major: 3, name: 'example', architecture: 1 });
    expect(result.metadata).toEqual({
      Name: 'demo',
      Version: '1.2.3',
      Release: '4',
      Architecture: 'x86_64',
    });
  });

  it('parses RPM files containing signature and main header sections', () => {
    const result = parseRpmHeader(makeRpm({
      signatureTags: [[1000, 'signature-size']],
      headerTags: [
        [1004, 'A package'], [1124, 'cpio'], [1125, 'gzip'], [9999, 'ignored'],
      ],
    }));

    expect(result.signature.entryCount).toBe(1);
    expect(result.header.entryCount).toBe(4);
    expect(result.metadata).toMatchObject({
      Summary: 'A package',
      'Payload format': 'cpio',
      'Payload compressor': 'gzip',
    });
    expect(result.header.tags.find((tag) => tag.tag === 9999)).toMatchObject({
      label: 'Tag 9999',
      value: null,
    });
  });

  it('rejects an unknown RPM lead magic', () => {
    const rpm = makeRpm();
    rpm[0] = 0;
    expect(() => parseRpmHeader(rpm)).toThrow(/lead magic/i);
  });

  it('reports truncated or malformed data as parser errors', () => {
    expect(() => parseRpmHeader(new Uint8Array(20))).toThrow(/truncated/i);
    const rpm = makeRpm({ headerTags: [[1000, 'demo']] });
    rpm[96] = 0;
    expect(() => parseRpmHeader(rpm)).toThrow(/signature header magic/i);
  });
});
