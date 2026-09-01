import { describe, expect, it } from 'vitest';
import {
  formatProperties,
  getDuplicateKeys,
  parseProperties,
  SAMPLE_PROPERTIES,
  toJSON,
} from './propertiesFormatter.utils.js';

describe('propertiesFormatter.utils', () => {
  describe('parseProperties', () => {
    it('parses blank lines and full-line comments starting with # or !', () => {
      const input = `
# a hash comment
! a bang comment

key = value
`;
      const { entries, errors } = parseProperties(input);
      expect(errors).toHaveLength(0);
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({ key: 'key', value: 'value', line: 5 });
    });

    it('supports =, :, and whitespace as separators', () => {
      const input = `key1 = value1\nkey2 : value2\nkey3   value3`;
      const { data, errors } = parseProperties(input);
      expect(errors).toHaveLength(0);
      expect(data).toEqual({ key1: 'value1', key2: 'value2', key3: 'value3' });
    });

    it('trims whitespace around the separator but keeps it out of the value', () => {
      const { data } = parseProperties('key   =    value with spaces');
      expect(data.key).toBe('value with spaces');
    });

    it('decodes escaped separators and whitespace within a key', () => {
      const { data } = parseProperties('a\\:key\\ with\\=escapes = value');
      expect(data['a:key with=escapes']).toBe('value');
    });

    it('decodes standard backslash escapes in values (\\t \\n \\r \\f \\\\)', () => {
      const { data } = parseProperties('key = a\\tb\\nc\\rd\\fe\\\\f');
      expect(data.key).toBe('a\tb\nc\rd\fe\\f');
    });

    it('decodes \\uXXXX Unicode escapes', () => {
      const { data } = parseProperties('greeting = \\uD55C\\uAE00');
      expect(data.greeting).toBe('한글');
    });

    it('drops the backslash for other escaped characters', () => {
      const { data } = parseProperties('key = \\a\\#\\!');
      expect(data.key).toBe('a#!');
    });

    it('joins continuation lines and strips leading whitespace from the continuation', () => {
      const input = 'key = first part \\\n    second part';
      const { data, entries, errors } = parseProperties(input);
      expect(errors).toHaveLength(0);
      expect(data.key).toBe('first part second part');
      expect(entries[0].line).toBe(1);
    });

    it('supports multiple chained continuation lines', () => {
      const input = 'key = a\\\nb\\\nc';
      const { data, errors } = parseProperties(input);
      expect(errors).toHaveLength(0);
      expect(data.key).toBe('abc');
    });

    it('preserves source order for display', () => {
      const input = 'z = 1\na = 2\nm = 3';
      const { entries } = parseProperties(input);
      expect(entries.map((e) => e.key)).toEqual(['z', 'a', 'm']);
    });

    it('applies last-value-wins semantics while flagging every duplicate occurrence', () => {
      const input = 'dup = first\nother = x\ndup = second';
      const { data, entries } = parseProperties(input);
      expect(data.dup).toBe('second');
      expect(data.other).toBe('x');
      expect(entries.filter((e) => e.key === 'dup').every((e) => e.duplicate)).toBe(true);
      expect(entries.find((e) => e.key === 'other').duplicate).toBe(false);
      // First occurrence position is retained even though the value is overwritten.
      expect(Object.keys(data)).toEqual(['dup', 'other']);
    });

    it('reports a line-numbered error for a malformed \\uXXXX escape', () => {
      const { errors, entries } = parseProperties('key = \\u12');
      expect(entries).toHaveLength(0);
      expect(errors).toHaveLength(1);
      expect(errors[0].line).toBe(1);
      expect(errors[0].message).toMatch(/Malformed \\uXXXX/);
    });

    it('reports a line-numbered error for a non-hex \\uXXXX escape', () => {
      const { errors } = parseProperties('key = \\uZZZZ');
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toMatch(/Malformed \\uXXXX/);
    });

    it('reports a line-numbered error for a dangling continuation at end of input', () => {
      const input = 'first = ok\nkey = value\\';
      const { errors, entries } = parseProperties(input);
      expect(errors).toHaveLength(1);
      expect(errors[0].line).toBe(2);
      expect(errors[0].message).toMatch(/Dangling line continuation/);
      // The well-formed entry before the dangling one is still parsed.
      expect(entries).toHaveLength(1);
      expect(entries[0].key).toBe('first');
    });

    it('handles an empty value and an empty key', () => {
      const { data } = parseProperties('emptyValue =\n= emptyKeyValue');
      expect(data.emptyValue).toBe('');
      expect(data['']).toBe('emptyKeyValue');
    });

    it('handles non-string input safely', () => {
      const { errors, entries, data } = parseProperties(null);
      expect(entries).toEqual([]);
      expect(data).toEqual({});
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toBe('Input must be a string.');
    });

    it('parses SAMPLE_PROPERTIES cleanly with the expected duplicate', () => {
      const { data, errors, entries } = parseProperties(SAMPLE_PROPERTIES);
      expect(errors).toHaveLength(0);
      expect(data['app.name']).toBe('Dev Toolkit Pro');
      expect(data['app.description']).toBe('A collection of developer utilities');
      expect(data['welcome.message']).toBe('Hello\tWorld\nEnjoy your stay!');
      expect(data['path.separator']).toBe('C:\\Program Files\\App');
      expect(data['greeting.unicode']).toBe('한글 Hello');
      expect(data['app.author']).toBe('Jane Doe');
      expect(entries.filter((e) => e.key === 'app.name')).toHaveLength(2);
    });

    it('preserves a key named __proto__ as a real own property', () => {
      const { data, entries, errors } = parseProperties('__proto__=kept');
      expect(errors).toHaveLength(0);
      expect(entries).toEqual([
        { key: '__proto__', value: 'kept', line: 1, duplicate: false },
      ]);
      expect(Object.keys(data)).toEqual(['__proto__']);
      expect(Object.prototype.hasOwnProperty.call(data, '__proto__')).toBe(true);
      expect(data.__proto__).toBe('kept');
    });
  });

  describe('formatProperties', () => {
    it('formats a parsed data map deterministically', () => {
      const formatted = formatProperties({ a: '1', b: 'two words' });
      expect(formatted).toBe('a=1\nb=two words');
    });

    it('escapes keys with separators, whitespace, and backslashes', () => {
      const formatted = formatProperties({ 'a key=x': 'val\\ue' });
      expect(formatted).toBe('a\\ key\\=x=val\\\\ue');
    });

    it('escapes control characters and leading whitespace in values', () => {
      const formatted = formatProperties({ key: '\tleading tab and\nnewline' });
      expect(formatted).toBe('key=\\tleading tab and\\nnewline');
    });

    it('round-trips decoded semantics through parse -> format -> parse', () => {
      const { data: original } = parseProperties(SAMPLE_PROPERTIES);
      const normalized = formatProperties(original);
      const { data: reparsed, errors } = parseProperties(normalized);
      expect(errors).toHaveLength(0);
      expect(reparsed).toEqual(original);
    });

    it('accepts raw string input and formats it', () => {
      expect(formatProperties('a:1\nb   2')).toBe('a=1\nb=2');
    });

    it('returns an empty string for invalid input', () => {
      expect(formatProperties('key = \\uZZZZ')).toBe('');
      expect(formatProperties(null)).toBe('');
    });

    it('includes a key named __proto__ in the normalized output', () => {
      expect(formatProperties('__proto__=kept')).toBe('__proto__=kept');
    });
  });

  describe('toJSON', () => {
    it('converts a data map to pretty-printed JSON', () => {
      const json = toJSON({ a: '1' });
      expect(JSON.parse(json)).toEqual({ a: '1' });
    });

    it('accepts raw .properties text', () => {
      const json = toJSON('key = value');
      expect(JSON.parse(json)).toEqual({ key: 'value' });
    });

    it('includes a key named __proto__ in the JSON output', () => {
      const json = toJSON('__proto__=kept');
      expect(json).toContain('"__proto__": "kept"');
      const parsed = JSON.parse(json);
      expect(Object.keys(parsed)).toEqual(['__proto__']);
      expect(parsed.__proto__).toBe('kept');
    });
  });

  describe('getDuplicateKeys', () => {
    it('returns unique duplicated keys in first-occurrence order', () => {
      const { entries } = parseProperties('b = 1\na = 2\nb = 3\na = 4');
      expect(getDuplicateKeys(entries)).toEqual(['b', 'a']);
    });

    it('returns an empty array when there are no duplicates', () => {
      const { entries } = parseProperties('a = 1\nb = 2');
      expect(getDuplicateKeys(entries)).toEqual([]);
    });

    it('handles non-array input safely', () => {
      expect(getDuplicateKeys(null)).toEqual([]);
    });
  });
});
