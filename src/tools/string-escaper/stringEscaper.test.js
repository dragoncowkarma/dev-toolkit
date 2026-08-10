import { describe, expect, it } from 'vitest';
import { escapeString, LANGUAGES, unescapeString } from './stringEscaper.utils.js';

describe('escapeString', () => {
  it('escapes JavaScript controls, a selected quote, and Unicode', () => {
    expect(escapeString('"\\\n🚀', LANGUAGES.JAVASCRIPT, { escapeUnicode: true }))
      .toBe('\\"\\\\\\n\\ud83d\\ude80');
    expect(escapeString("it's", LANGUAGES.JAVASCRIPT, { quoteStyle: 'single' }))
      .toBe("it\\'s");
  });

  it('escapes HTML reserved characters including slashes', () => {
    expect(escapeString('<a href="/">\'&</a>', LANGUAGES.HTML))
      .toBe('&lt;a href=&quot;&#47;&quot;&gt;&#39;&amp;&lt;&#47;a&gt;');
  });

  it('escapes SQL quotes and backslashes', () => {
    expect(escapeString("O'Reilly\\books", LANGUAGES.SQL)).toBe("O''Reilly\\\\books");
  });

  it('escapes Java and Python control characters', () => {
    expect(escapeString('a\r\nb\t"', LANGUAGES.JAVA)).toBe('a\\r\\nb\\t\\"');
    expect(escapeString("a\n'b", LANGUAGES.PYTHON, { quoteStyle: 'single' }))
      .toBe("a\\n\\'b");
  });

  it('preserves empty input and rejects unsupported input', () => {
    expect(escapeString('', LANGUAGES.HTML)).toBe('');
    expect(() => escapeString('value', 'ruby')).toThrow('supported target language');
  });
});

describe('unescapeString', () => {
  it('decodes JavaScript escape sequences and Unicode code points', () => {
    expect(unescapeString('line\\n\\u0041\\u{1f680}', LANGUAGES.JAVASCRIPT))
      .toBe('line\nA🚀');
  });

  it('decodes HTML named and numeric entities without changing invalid ones', () => {
    expect(unescapeString('&lt;&#47;&#x1f680;&unknown;', LANGUAGES.HTML)).toBe('</🚀&unknown;');
  });

  it('decodes SQL quotes and escaped backslashes', () => {
    expect(unescapeString("O''Reilly\\\\books", LANGUAGES.SQL)).toBe("O'Reilly\\books");
  });

  it('decodes Java and Python escapes and preserves unknown sequences', () => {
    expect(unescapeString('a\\r\\nb\\t\\"', LANGUAGES.JAVA)).toBe('a\r\nb\t"');
    expect(unescapeString("a\\n\\'b\\q", LANGUAGES.PYTHON)).toBe("a\n'b\\q");
  });
});
