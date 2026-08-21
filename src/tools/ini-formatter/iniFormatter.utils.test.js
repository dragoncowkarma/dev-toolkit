import { describe, expect, it } from 'vitest';
import {
  formatIni,
  parseIni,
  SAMPLE_INI,
  toJSON,
} from './iniFormatter.utils.js';

describe('iniFormatter.utils', () => {
  describe('parseIni', () => {
    it('parses valid INI with global keys and sections', () => {
      const input = `
title = My Application
version = 1.2.3

[database]
host = localhost
port = 5432
`;
      const result = parseIni(input);
      expect(result.errors).toHaveLength(0);
      expect(result.data).toEqual({
        title: 'My Application',
        version: '1.2.3',
        database: {
          host: 'localhost',
          port: '5432',
        },
      });
    });

    it('supports both = and : separators', () => {
      const input = `
key1 = value1
key2 : value2
[section]
secKey1 = val1
secKey2 : val2
`;
      const { data, errors } = parseIni(input);
      expect(errors).toHaveLength(0);
      expect(data.key1).toBe('value1');
      expect(data.key2).toBe('value2');
      expect(data.section.secKey1).toBe('val1');
      expect(data.section.secKey2).toBe('val2');
    });

    it('handles ; and # comments (line and inline)', () => {
      const input = `
# Line comment 1
; Line comment 2
key1 = value1 ; inline comment
[section] # section comment
key2 = value2 # another inline comment
`;
      const { data, errors } = parseIni(input);
      expect(errors).toHaveLength(0);
      expect(data.key1).toBe('value1');
      expect(data.section.key2).toBe('value2');
    });

    it('parses quoted values with escape sequences', () => {
      const input = `
quoted1 = "hello \\"world\\""
quoted2 = 'single \\'quoted\\''
quoted3 = "line1\\nline2"
commentInside = "value;with#symbols"
`;
      const { data, errors } = parseIni(input);
      expect(errors).toHaveLength(0);
      expect(data.quoted1).toBe('hello "world"');
      expect(data.quoted2).toBe("single 'quoted'");
      expect(data.quoted3).toBe('line1\nline2');
      expect(data.commentInside).toBe('value;with#symbols');
    });

    it('handles duplicate keys by taking the last value (last value wins)', () => {
      const input = `
duplicateKey = first
duplicateKey = second

[section]
dup = item1
dup = item2
`;
      const { data, errors } = parseIni(input);
      expect(errors).toHaveLength(0);
      expect(data.duplicateKey).toBe('second');
      expect(data.section.dup).toBe('item2');
    });

    it('reports error for unclosed section header', () => {
      const input = `[section_without_bracket`;
      const { errors } = parseIni(input);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toEqual({
        line: 1,
        message: 'Unclosed section header.',
      });
    });

    it('reports error for missing key before separator', () => {
      const input = `= value`;
      const { errors } = parseIni(input);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toEqual({
        line: 1,
        message: 'Missing key before separator.',
      });
    });

    it('reports error for line without separator or section header', () => {
      const input = `invalid_line_syntax`;
      const { errors } = parseIni(input);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toEqual({
        line: 1,
        message: 'Expected key-value pair or section header.',
      });
    });

    it('reports error for unterminated quoted string', () => {
      const input = `key = "unclosed quote`;
      const { errors } = parseIni(input);
      expect(errors).toHaveLength(1);
      expect(errors[0]).toEqual({
        line: 1,
        message: 'Unterminated quoted string.',
      });
    });

    it('handles non-string input safely', () => {
      const { errors } = parseIni(null);
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toBe('Input must be a string.');
    });

    it('parses SAMPLE_INI cleanly', () => {
      const { data, errors } = parseIni(SAMPLE_INI);
      expect(errors).toHaveLength(0);
      expect(data.appName).toBe('DevToolkit');
      expect(data.database.password).toBe('secret_password;123');
    });
  });

  describe('formatIni', () => {
    it('formats a parsed object into normalized INI text', () => {
      const obj = {
        title: 'App',
        server: {
          host: '127.0.0.1',
          port: '8080',
        },
      };
      const formatted = formatIni(obj);
      expect(formatted).toBe('title = App\n\n[server]\nhost = 127.0.0.1\nport = 8080');
    });

    it('quotes strings containing spaces or special characters', () => {
      const obj = {
        msg: 'hello world',
        secret: 'pass;word',
      };
      const formatted = formatIni(obj);
      expect(formatted).toBe('msg = "hello world"\nsecret = "pass;word"');
    });

    it('formats raw INI string input', () => {
      const raw = 'key:val\n[sec]\na=b';
      const formatted = formatIni(raw);
      expect(formatted).toBe('key = val\n\n[sec]\na = b');
    });

    it('returns empty string when input is invalid or contains errors', () => {
      expect(formatIni('[invalid')).toBe('');
      expect(formatIni(null)).toBe('');
    });
  });

  describe('toJSON', () => {
    it('converts INI input to formatted JSON string', () => {
      const input = `
key = value
[sec]
foo = bar
`;
      const jsonStr = toJSON(input);
      const parsedJSON = JSON.parse(jsonStr);
      expect(parsedJSON).toEqual({
        key: 'value',
        sec: { foo: 'bar' },
      });
    });
  });
});
