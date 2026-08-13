import { describe, expect, it } from 'vitest';
import {
  decodePunycode,
  detectScripts,
  encodePunycode,
  splitDomainLabels,
  toASCII,
  toUnicode,
} from './punycode.utils.js';

describe('Punycode Utilities (RFC 3492)', () => {
  describe('encodePunycode & decodePunycode', () => {
    it('encodes and decodes German sample (münchen)', () => {
      const unicode = 'münchen';
      const encoded = encodePunycode(unicode);
      expect(encoded).toBe('mnchen-3ya');
      expect(decodePunycode(encoded)).toBe(unicode);
    });

    it('encodes and decodes Korean sample (한국)', () => {
      const unicode = '한국';
      const encoded = encodePunycode(unicode);
      expect(encoded).toBe('3e0b707e');
      expect(decodePunycode(encoded)).toBe(unicode);
    });

    it('verifies RFC 3492 Section 7.1 Arabic sample', () => {
      const unicode = String.fromCharCode(
        0x0644, 0x064a, 0x0647, 0x0645, 0x0627, 0x0628, 0x062a, 0x0643,
        0x0644, 0x0645, 0x0648, 0x0634, 0x0639, 0x0631, 0x0628, 0x064a, 0x061f,
      );
      const expected = 'egbpdaj6bu4bxfgehfvwxn';
      expect(encodePunycode(unicode)).toBe(expected);
      expect(decodePunycode(expected)).toBe(unicode);
    });

    it('verifies RFC 3492 Section 7.1 Simplified Chinese sample', () => {
      const unicode = String.fromCharCode(
        0x4ed6, 0x4eec, 0x4e3a, 0x4ec0, 0x4e48, 0x4e0d, 0x8bf4, 0x4e2d, 0x6587,
      );
      const expected = 'ihqwcrb4cv8a8dqg056pqjye';
      expect(encodePunycode(unicode)).toBe(expected);
      expect(decodePunycode(expected)).toBe(unicode);
    });

    it('verifies RFC 3492 Section 7.1 Traditional Chinese sample', () => {
      const unicode = String.fromCharCode(
        0x4ed6, 0x5011, 0x7232, 0x4ec0, 0x9ebd, 0x4e0d, 0x8aaa, 0x4e2d, 0x6587,
      );
      const expected = 'ihqwctvzc91f659drss3x8bo0yb';
      expect(encodePunycode(unicode)).toBe(expected);
      expect(decodePunycode(expected)).toBe(unicode);
    });

    it('verifies RFC 3492 Section 7.1 Japanese sample', () => {
      const unicode = String.fromCharCode(
        0x306a, 0x305c, 0x307f, 0x3093, 0x306a, 0x65e5, 0x672c, 0x8a9e,
        0x3092, 0x8a71, 0x3057, 0x3066, 0x304f, 0x308c, 0x306a, 0x3044, 0x306e, 0x304b,
      );
      const expected = 'n8jok5ay5dzabd5bym9f0cm5685rrjetr6pdxa';
      expect(encodePunycode(unicode)).toBe(expected);
      expect(decodePunycode(expected)).toBe(unicode);
    });

    it('verifies RFC 3492 Section 7.1 Korean Hangul sample', () => {
      const unicode = String.fromCharCode(
        0xc138, 0xacc4, 0xc758, 0xbaa8, 0xb4e0, 0xc0ac, 0xb78c, 0xb4e4, 0xc774,
        0xd55c, 0xad6d, 0xc5b4, 0xb97c, 0xc774, 0xd574, 0xd55c, 0xb2e4, 0xba74,
        0xc5bc, 0xb9c8, 0xb098, 0xc88b, 0xc744, 0xae4c,
      );
      const expected =
        '989aomsvi5e83db1d2a355cv1e0vak1dwrv93d5xbh15a0dt30a5jpsd879ccm6fea98c';
      expect(encodePunycode(unicode)).toBe(expected);
      expect(decodePunycode(expected)).toBe(unicode);
    });

    it('handles astral-plane characters (surrogate pairs / emoji)', () => {
      const emojiDomain = '🍕';
      const encoded = encodePunycode(emojiDomain);
      expect(encoded).toBe('vi8h');
      expect(decodePunycode('vi8h')).toBe('🍕');
    });
  });

  describe('detectScripts', () => {
    it('detects single script correctly', () => {
      expect(detectScripts('example')).toEqual(['Latin']);
      expect(detectScripts('مصر')).toEqual(['Arabic']);
      expect(detectScripts('한국')).toEqual(['Hangul']);
      expect(detectScripts('Москва')).toEqual(['Cyrillic']);
      expect(detectScripts('ㄅ')).toEqual(['Bopomofo']);
    });

    it('detects mixed script (Latin + Cyrillic homograph)', () => {
      const mixedStr = '\u0430pple';
      const scripts = detectScripts(mixedStr);
      expect(scripts).toEqual(['Cyrillic', 'Latin']);
    });

    it('ignores neutral Common and Inherited characters (digits, hyphens)', () => {
      expect(detectScripts('example-123')).toEqual(['Latin']);
    });
  });

  describe('splitDomainLabels', () => {
    it('splits by standard dot and fullwidth dot variants', () => {
      expect(splitDomainLabels('a.b.c')).toEqual(['a', 'b', 'c']);
      expect(splitDomainLabels('a。b．c｡d')).toEqual(['a', 'b', 'c', 'd']);
    });
  });

  describe('toASCII', () => {
    it('passes pure-ASCII input through unchanged with no xn-- prefix', () => {
      const res = toASCII('example.com');
      expect(res.ascii).toBe('example.com');
      expect(res.unicode).toBe('example.com');
      expect(res.errors).toHaveLength(0);
    });

    it('converts multi-label IDN domain correctly', () => {
      const res = toASCII('münchen.example.한국');
      expect(res.ascii).toBe('xn--mnchen-3ya.example.xn--3e0b707e');
      expect(res.unicode).toBe('münchen.example.한국');
      expect(res.errors).toHaveLength(0);
    });

    it('converts mixed encoded and plain labels correctly', () => {
      const res = toASCII('münchen.example.com');
      expect(res.ascii).toBe('xn--mnchen-3ya.example.com');
      expect(res.errors).toHaveLength(0);
    });

    it('normalizes Unicode NFC and applies lowercasing', () => {
      const decomposed = 'e\u0301xample.com';
      const res = toASCII(decomposed);
      expect(res.unicode).toBe('éxample.com');
      expect(res.ascii).toBe('xn--xample-9ua.com');
    });

    it('flags label exceeding 63 bytes with specific error', () => {
      const longLabel = 'a'.repeat(64);
      const res = toASCII(`${longLabel}.com`);
      expect(res.errors.some((e) => e.includes('exceeds maximum length of 63 bytes'))).toBe(true);
      expect(res.ascii).toBe('');
    });

    it('flags total domain exceeding 253 bytes with specific error', () => {
      const label = 'a'.repeat(60);
      const longDomain = `${label}.${label}.${label}.${label}.${label}.com`;
      const res = toASCII(longDomain);
      expect(res.errors.some((e) => e.includes('exceeds maximum limit of 253 bytes'))).toBe(true);
    });

    it('rejects structurally invalid domains (leading/trailing/double dot)', () => {
      expect(toASCII('.example.com').errors.some((e) => e.includes('empty label'))).toBe(true);
      expect(toASCII('example..com').errors.some((e) => e.includes('empty label'))).toBe(true);
      expect(toASCII('example.com.').errors.some((e) => e.includes('empty label'))).toBe(true);
    });

    it('rejects labels starting or ending with a hyphen', () => {
      expect(toASCII('-example.com').errors.some((e) => e.includes('hyphen'))).toBe(true);
      expect(toASCII('example-.com').errors.some((e) => e.includes('hyphen'))).toBe(true);
    });

    it('flags mixed-script homograph risk as non-blocking warning', () => {
      const homographDomain = '\u0430pple.com';
      const res = toASCII(homographDomain);
      expect(res.ascii).toBe('xn--pple-43d.com');
      expect(res.warnings).toHaveLength(1);
      expect(res.warnings[0]).toContain('Cyrillic, Latin');
      expect(res.errors).toHaveLength(0);
    });

    it('does not flag Japanese domains mixing Han/Kana as homograph risk', () => {
      const res1 = toASCII('みんなの銀行.jp');
      expect(res1.ascii).toBe('xn--q9ji3c6d1727c01m.jp');
      expect(res1.warnings).toHaveLength(0);
      expect(res1.errors).toHaveLength(0);

      const res2 = toASCII('日本語ドメイン名.jp');
      expect(res2.ascii).toBe('xn--eckwd4c7c777u7mwo4bc84j.jp');
      expect(res2.warnings).toHaveLength(0);
      expect(res2.errors).toHaveLength(0);
    });

    it('does not flag standard Korean domains mixing Hangul and Hanja as homograph risk', () => {
      const res = toASCII('한국.대한민국');
      expect(res.warnings).toHaveLength(0);
      expect(res.errors).toHaveLength(0);
    });

    it('does not flag Chinese domains mixing Han and Bopomofo as homograph risk', () => {
      const res = toASCII('漢ㄅ.example');
      expect(res.labels[0].scripts).toEqual(['Bopomofo', 'Han']);
      expect(res.labels[0].hasHomographRisk).toBe(false);
      expect(res.warnings).toHaveLength(0);
      expect(res.errors).toHaveLength(0);
    });

    it('flags Bopomofo and Latin labels as a mixed-script homograph risk', () => {
      const res = toASCII('ㄅa.example');
      expect(res.labels[0].scripts).toEqual(['Bopomofo', 'Latin']);
      expect(res.labels[0].hasHomographRisk).toBe(true);
      expect(res.warnings).toHaveLength(1);
      expect(res.warnings[0]).toContain('Bopomofo, Latin');
      expect(res.errors).toHaveLength(0);
    });

    it('rejects labels containing non-LDH characters (URLs, spaces, symbols)', () => {
      const resUrl1 = toASCII('münchen.de/path');
      expect(resUrl1.errors.some((e) => e.includes('contains character "/"'))).toBe(true);
      expect(resUrl1.ascii).toBe('');

      const resUrl2 = toASCII('http://例え.テスト');
      expect(resUrl2.errors.some((e) => e.includes('contains character ":"'))).toBe(true);
      expect(resUrl2.ascii).toBe('');

      const resUrl3 = toASCII('user@münchen.de');
      expect(resUrl3.errors.some((e) => e.includes('contains character "@"'))).toBe(true);
      expect(resUrl3.ascii).toBe('');

      const resSpace = toASCII('hello world.com');
      expect(resSpace.errors.some((e) => e.includes('contains character " "'))).toBe(true);
      expect(resSpace.ascii).toBe('');

      const resSymbol = toASCII('a!b.com');
      expect(resSymbol.errors.some((e) => e.includes('contains character "!"'))).toBe(true);
      expect(resSymbol.ascii).toBe('');
    });
  });

  describe('toUnicode', () => {
    it('decodes ACE domain to Unicode', () => {
      const res = toUnicode('xn--mnchen-3ya.example.xn--3e0b707e');
      expect(res.unicode).toBe('münchen.example.한국');
      expect(res.ascii).toBe('xn--mnchen-3ya.example.xn--3e0b707e');
      expect(res.errors).toHaveLength(0);
    });

    it('handles uppercase XN-- prefix case-insensitively', () => {
      const res = toUnicode('XN--MNCHEN-3YA.EXAMPLE.COM');
      expect(res.unicode).toBe('münchen.example.com');
    });

    it('round-trip holds: decode(encode(x)) === NFC(x.toLowerCase())', () => {
      const testCases = [
        'münchen.example.한국',
        'sub.domain.example.com',
        '🍕.com',
        '서울.한국',
      ];
      for (const tc of testCases) {
        const asciiRes = toASCII(tc);
        const uniRes = toUnicode(asciiRes.ascii);
        expect(uniRes.unicode).toBe(tc.normalize('NFC').toLowerCase());
      }
    });

    it('reports clear error for malformed ACE payload (invalid base-36 digit)', () => {
      const res = toUnicode('xn--invalid_digit!.com');
      expect(res.errors.some((e) => e.includes('contains character'))).toBe(true);
      expect(res.unicode).toBe('');
    });

    it('reports clear error for xn-- with empty payload', () => {
      const res = toUnicode('xn--.com');
      expect(res.errors.some((e) => e.includes('empty payload'))).toBe(true);
    });

    it('rejects non-LDH inputs in toUnicode decoding', () => {
      const res = toUnicode('münchen.de/path');
      expect(res.errors.some((e) => e.includes('contains character "/"'))).toBe(true);
      expect(res.unicode).toBe('');
    });
  });
});
