import { describe, expect, it } from 'vitest';
import {
  extractRegistrationTree,
  extractStructuredSuffix,
  formatParamValue,
  isHttpToken,
  parseMimeType,
  toJSONRepresentation,
} from './mimeTypeInspector.utils.js';

describe('mimeTypeInspector.utils', () => {
  describe('isHttpToken', () => {
    it('validates standard HTTP tokens', () => {
      expect(isHttpToken('application')).toBe(true);
      expect(isHttpToken('vnd.api+json')).toBe(true);
      expect(isHttpToken('utf-8')).toBe(true);
      expect(isHttpToken("!#$%&'*+._`|~-")).toBe(true);
    });

    it('rejects invalid HTTP tokens containing separators or control chars', () => {
      expect(isHttpToken('')).toBe(false);
      expect(isHttpToken('text/html')).toBe(false);
      expect(isHttpToken('name=value')).toBe(false);
      expect(isHttpToken('with space')).toBe(false);
      expect(isHttpToken('with"quote')).toBe(false);
    });
  });

  describe('formatParamValue', () => {
    it('returns unquoted tokens as-is', () => {
      expect(formatParamValue('utf-8')).toBe('utf-8');
      expect(formatParamValue('12345')).toBe('12345');
    });

    it('quotes and escapes values containing special characters or spaces', () => {
      expect(formatParamValue('hello world')).toBe('"hello world"');
      expect(formatParamValue('foo"bar')).toBe('"foo\\"bar"');
      expect(formatParamValue('C:\\Path')).toBe('"C:\\\\Path"');
      expect(formatParamValue('')).toBe('""');
    });
  });

  describe('extractRegistrationTree', () => {
    it('identifies vendor, personal, experimental, and standards trees', () => {
      expect(extractRegistrationTree('vnd.api+json')).toBe('Vendor Tree (vnd.)');
      expect(extractRegistrationTree('prs.example')).toBe('Personal Tree (prs.)');
      expect(extractRegistrationTree('x-custom')).toBe('Unregistered / Experimental Tree');
      expect(extractRegistrationTree('x.custom')).toBe('Unregistered / Experimental Tree');
      expect(extractRegistrationTree('html')).toBe('Standards Tree');
    });
  });

  describe('extractStructuredSuffix', () => {
    it('extracts syntax suffixes correctly', () => {
      expect(extractStructuredSuffix('svg+xml')).toBe('xml');
      expect(extractStructuredSuffix('vnd.api+json')).toBe('json');
      expect(extractStructuredSuffix('html')).toBeNull();
    });
  });

  describe('parseMimeType', () => {
    it('parses bare media types into type, subtype, parameters, and canonical result', () => {
      const res = parseMimeType('text/html; charset=utf-8');
      expect(res.isValid).toBe(true);
      expect(res.isHeaderLine).toBe(false);
      expect(res.type).toBe('text');
      expect(res.subtype).toBe('html');
      expect(res.fullType).toBe('text/html');
      expect(res.parameters).toEqual([
        { name: 'charset', value: 'utf-8', raw: 'charset=utf-8', isQuoted: false },
      ]);
      expect(res.canonical).toBe('text/html; charset=utf-8');
    });

    it('parses full Content-Type header values case-insensitively', () => {
      const res = parseMimeType('Content-Type: APPLICATION/JSON; CHARSET="utf-8"');
      expect(res.isValid).toBe(true);
      expect(res.isHeaderLine).toBe(true);
      expect(res.headerPrefix).toBe('Content-Type:');
      expect(res.type).toBe('application');
      expect(res.subtype).toBe('json');
      expect(res.fullType).toBe('application/json');
      expect(res.parameterMap).toEqual({ charset: 'utf-8' });
      expect(res.canonical).toBe('application/json; charset=utf-8');
    });

    it('handles quoted parameters with escaped quotes without losing values', () => {
      const input = 'application/vnd.api+json; name="foo\\"bar\\\\baz"; boundary=---Boundary123';
      const res = parseMimeType(input);
      expect(res.isValid).toBe(true);
      expect(res.type).toBe('application');
      expect(res.subtype).toBe('vnd.api+json');
      expect(res.parameterMap.name).toBe('foo"bar\\baz');
      expect(res.parameterMap.boundary).toBe('---Boundary123');
      expect(res.canonical).toBe(
        'application/vnd.api+json; name="foo\\"bar\\\\baz"; boundary=---Boundary123',
      );
    });

    it('normalizes type, subtype, and parameter names preserving parameter value casing', () => {
      const input = 'TEXT/PLAIN; CHARSET=UTF-8; Boundary=MyCustomBoundary_123';
      const res = parseMimeType(input);
      expect(res.isValid).toBe(true);
      expect(res.type).toBe('text');
      expect(res.subtype).toBe('plain');
      expect(res.parameters[0]).toEqual({
        name: 'charset',
        value: 'UTF-8',
        raw: 'CHARSET=UTF-8',
        isQuoted: false,
      });
      expect(res.parameters[1]).toEqual({
        name: 'boundary',
        value: 'MyCustomBoundary_123',
        raw: 'Boundary=MyCustomBoundary_123',
        isQuoted: false,
      });
      expect(res.canonical).toBe(
        'text/plain; charset=UTF-8; boundary=MyCustomBoundary_123',
      );
    });

    it('detects duplicate parameters case-insensitively', () => {
      const res = parseMimeType('text/html; charset=utf-8; CHARSET=us-ascii');
      expect(res.isValid).toBe(false);
      expect(res.error).toContain('Duplicate parameter name "charset"');
    });

    it('detects malformed quoted strings', () => {
      const res = parseMimeType('text/html; charset="utf-8');
      expect(res.isValid).toBe(false);
      expect(res.error).toContain('unclosed double quote');
    });

    it('detects invalid media type tokens and syntax errors', () => {
      expect(parseMimeType('invalid_no_slash').isValid).toBe(false);
      expect(parseMimeType('text/html/extra').isValid).toBe(false);
      expect(parseMimeType('/html').isValid).toBe(false);
      expect(parseMimeType('text/').isValid).toBe(false);
      expect(parseMimeType('text /html').isValid).toBe(false);
      expect(parseMimeType('text/html@invalid').isValid).toBe(false);
    });

    it('validates charset values and raises warnings for uncommon charsets', () => {
      const validCharsetRes = parseMimeType('text/plain; charset=utf-8');
      expect(validCharsetRes.isValid).toBe(true);
      expect(validCharsetRes.warnings).toHaveLength(0);

      const uncommonCharsetRes = parseMimeType('text/plain; charset=custom-charset-99');
      expect(uncommonCharsetRes.isValid).toBe(true);
      expect(uncommonCharsetRes.warnings[0]).toContain('Non-standard charset');
    });

    it('warns about missing boundary in multipart/form-data', () => {
      const res = parseMimeType('multipart/form-data');
      expect(res.isValid).toBe(true);
      expect(res.warnings[0]).toContain('boundary');
    });

    it('correctly classifies known types with category and note', () => {
      const typesToTest = [
        ['application/json', 'Structured Data'],
        ['text/html', 'Web Document'],
        ['text/css', 'Stylesheet'],
        ['application/javascript', 'Script'],
        ['image/svg+xml', 'Vector Image'],
        ['application/pdf', 'Document'],
        ['application/zip', 'Archive'],
        ['application/wasm', 'Binary Executable'],
        ['application/x-www-form-urlencoded', 'Form Data'],
        ['image/png', 'Raster Image'],
        ['font/woff2', 'Font'],
      ];

      for (const [mime, expectedCategory] of typesToTest) {
        const res = parseMimeType(mime);
        expect(res.isValid).toBe(true);
        expect(res.isKnown).toBe(true);
        expect(res.category).toBe(expectedCategory);
        expect(res.handlingNote).toBeTruthy();
      }
    });

    it('retains valid unknown types as unrecognized without throwing or guessing', () => {
      const res = parseMimeType('application/custom-vendor-type+json');
      expect(res.isValid).toBe(true);
      expect(res.isKnown).toBe(false);
      expect(res.category).toBe('Unrecognized / Custom');
      expect(res.handlingNote).toContain('Syntactically valid media type');
    });
  });

  describe('toJSONRepresentation', () => {
    it('serializes parsed MIME type result into formatted JSON', () => {
      const res = parseMimeType('text/html; charset=utf-8');
      const jsonStr = toJSONRepresentation(res);
      const parsed = JSON.parse(jsonStr);

      expect(parsed.canonical).toBe('text/html; charset=utf-8');
      expect(parsed.type).toBe('text');
      expect(parsed.subtype).toBe('html');
      expect(parsed.parameters).toEqual({ charset: 'utf-8' });
      expect(parsed.isKnown).toBe(true);
      expect(parsed.category).toBe('Web Document');
    });
  });
});
