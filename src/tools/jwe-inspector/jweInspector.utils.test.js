import { describe, expect, it } from 'vitest';
import { decodeBase64Url, inspectCompactJwe } from './jweInspector.utils.js';

const validCompactJwe = [
  'eyJhbGciOiJSU0EtT0FFUCIsImVuYyI6IkEyNTZHQ00iLCJraWQiOiJrZXktMSJ9',
  'AQID',
  'BAUGBw',
  'CAkKCww',
  'DQ4PEBESExQ',
].join('.');

describe('decodeBase64Url', () => {
  it('decodes valid unpadded Base64URL data', () => {
    expect(new TextDecoder().decode(decodeBase64Url('SGVsbG8'))).toBe('Hello');
  });

  it.each([
    ['padding', 'SGVsbG8='],
    ['an invalid Base64URL length', 'a'],
    ['invalid characters', 'SGVsbG8!'],
  ])('rejects %s', (_, value) => {
    expect(() => decodeBase64Url(value)).toThrow('contains invalid Base64URL data');
  });
});

describe('inspectCompactJwe', () => {
  it('returns the protected header and decoded encrypted segment lengths', () => {
    expect(inspectCompactJwe(validCompactJwe)).toEqual({
      header: { alg: 'RSA-OAEP', enc: 'A256GCM', kid: 'key-1' },
      segmentLengths: {
        'Encrypted Key': 3,
        IV: 4,
        Ciphertext: 5,
        'Authentication Tag': 8,
      },
    });
  });

  it('rejects compact serializations without exactly five segments', () => {
    expect(() => inspectCompactJwe('one.two.three.four')).toThrow(
      /exactly 5 dot-separated segments/,
    );
  });

  it.each([
    ['invalid Base64URL header data', '!.AQID.BAUGBw.CAkKCww.DQ4PEBESExQ', /Protected Header/],
    ['invalid UTF-8 header data', 'gA.AQID.BAUGBw.CAkKCww.DQ4PEBESExQ', /Protected Header/],
    ['invalid JSON header data', 'bm90LWpzb24.AQID.BAUGBw.CAkKCww.DQ4PEBESExQ', /valid JSON/],
    ['a null header', 'bnVsbA.AQID.BAUGBw.CAkKCww.DQ4PEBESExQ', /JSON object/],
    ['an array header', 'W10.AQID.BAUGBw.CAkKCww.DQ4PEBESExQ', /JSON object/],
  ])('rejects %s', (_, compactJwe, expectedError) => {
    expect(() => inspectCompactJwe(compactJwe)).toThrow(expectedError);
  });

  it.each([
    ['Encrypted Key', 'e30.a.BAUGBw.CAkKCww.DQ4PEBESExQ'],
    ['IV', 'e30.AQID.a.CAkKCww.DQ4PEBESExQ'],
    ['Ciphertext', 'e30.AQID.BAUGBw.a.DQ4PEBESExQ'],
    ['Authentication Tag', 'e30.AQID.BAUGBw.CAkKCww.a'],
  ])('rejects corrupted %s segment lengths', (name, compactJwe) => {
    expect(() => inspectCompactJwe(compactJwe)).toThrow(
      `The ${name} segment contains invalid Base64URL data.`,
    );
  });
});
