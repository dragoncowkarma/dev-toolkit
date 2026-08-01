import { describe, expect, it } from 'vitest';
import {
  CASE_TYPES,
  convertLine,
  convertText,
  convertToAllCases,
  splitIntoWords,
} from './caseConverter.utils.js';

describe('splitIntoWords', () => {
  it('splits on whitespace and punctuation separators', () => {
    expect(splitIntoWords('hello world')).toEqual(['hello', 'world']);
    expect(splitIntoWords('hello_world-foo.bar')).toEqual(['hello', 'world', 'foo', 'bar']);
  });

  it('splits camelCase and PascalCase boundaries', () => {
    expect(splitIntoWords('helloWorld')).toEqual(['hello', 'World']);
    expect(splitIntoWords('HelloWorldFoo')).toEqual(['Hello', 'World', 'Foo']);
  });

  it('splits acronym runs from the following word', () => {
    expect(splitIntoWords('XMLHttpRequest')).toEqual(['XML', 'Http', 'Request']);
    expect(splitIntoWords('parseJSONInput')).toEqual(['parse', 'JSON', 'Input']);
  });

  it('splits letter/digit boundaries in either direction', () => {
    expect(splitIntoWords('user2Name')).toEqual(['user', '2', 'Name']);
    expect(splitIntoWords('version2')).toEqual(['version', '2']);
    expect(splitIntoWords('2fast2furious')).toEqual(['2', 'fast', '2', 'furious']);
  });

  it('handles mixed delimiters and casing together', () => {
    expect(splitIntoWords('foo-bar_baz quxCorge')).toEqual([
      'foo',
      'bar',
      'baz',
      'qux',
      'Corge',
    ]);
    expect(splitIntoWords('  multiple   spaces  ')).toEqual(['multiple', 'spaces']);
  });

  it('returns an empty array for blank input', () => {
    expect(splitIntoWords('')).toEqual([]);
    expect(splitIntoWords('   ')).toEqual([]);
  });

  it('throws for non-string input', () => {
    expect(() => splitIntoWords(null)).toThrow(TypeError);
  });
});

describe('convertLine', () => {
  const input = 'XMLHttpRequest_2 test';

  it('converts to camelCase', () => {
    expect(convertLine(input, CASE_TYPES.CAMEL)).toBe('xmlHttpRequest2Test');
  });

  it('converts to PascalCase', () => {
    expect(convertLine(input, CASE_TYPES.PASCAL)).toBe('XmlHttpRequest2Test');
  });

  it('converts to snake_case', () => {
    expect(convertLine(input, CASE_TYPES.SNAKE)).toBe('xml_http_request_2_test');
  });

  it('converts to kebab-case', () => {
    expect(convertLine(input, CASE_TYPES.KEBAB)).toBe('xml-http-request-2-test');
  });

  it('converts to CONSTANT_CASE', () => {
    expect(convertLine(input, CASE_TYPES.CONSTANT)).toBe('XML_HTTP_REQUEST_2_TEST');
  });

  it('converts to Title Case', () => {
    expect(convertLine(input, CASE_TYPES.TITLE)).toBe('Xml Http Request 2 Test');
  });

  it('converts to lower case', () => {
    expect(convertLine(input, CASE_TYPES.LOWER)).toBe('xml http request 2 test');
  });

  it('converts to UPPER CASE', () => {
    expect(convertLine(input, CASE_TYPES.UPPER)).toBe('XML HTTP REQUEST 2 TEST');
  });

  it('returns an empty string for blank lines', () => {
    expect(convertLine('', CASE_TYPES.CAMEL)).toBe('');
    expect(convertLine('   ', CASE_TYPES.SNAKE)).toBe('');
  });

  it('throws for an unsupported case type', () => {
    expect(() => convertLine('foo', 'binary')).toThrow(TypeError);
  });
});

describe('convertText', () => {
  it('converts each line independently and preserves line structure', () => {
    expect(convertText('helloWorld\nfoo_bar\n\nBAZ_QUX', CASE_TYPES.SNAKE)).toBe(
      'hello_world\nfoo_bar\n\nbaz_qux'
    );
  });

  it('normalizes CRLF and CR line endings', () => {
    expect(convertText('fooBar\r\nbazQux', CASE_TYPES.KEBAB)).toBe('foo-bar\nbaz-qux');
    expect(convertText('fooBar\rbazQux', CASE_TYPES.KEBAB)).toBe('foo-bar\nbaz-qux');
  });

  it('throws for non-string input', () => {
    expect(() => convertText(42, CASE_TYPES.CAMEL)).toThrow(TypeError);
  });
});

describe('convertToAllCases', () => {
  it('returns every supported case conversion keyed by case type', () => {
    const result = convertToAllCases('user_id');

    expect(result).toEqual({
      camel: 'userId',
      pascal: 'UserId',
      snake: 'user_id',
      kebab: 'user-id',
      constant: 'USER_ID',
      title: 'User Id',
      lower: 'user id',
      upper: 'USER ID',
    });
  });

  it('preserves multi-line structure across every case type', () => {
    const result = convertToAllCases('fooBar\nbazQux');
    expect(result.camel).toBe('fooBar\nbazQux');
    expect(result.snake).toBe('foo_bar\nbaz_qux');
  });
});
