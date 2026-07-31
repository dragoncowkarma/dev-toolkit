import { describe, expect, it } from 'vitest';
import {
  decodeHtmlEntities,
  encodeHtmlEntities,
  ENTITY_MODES,
  ENTITY_SCOPES,
} from './htmlEntity.utils.js';

describe('encodeHtmlEntities', () => {
  it('encodes HTML reserved characters with named entities by default', () => {
    expect(encodeHtmlEntities('<tag attr="value"> & \'text\'')).toBe(
      '&lt;tag attr=&quot;value&quot;&gt; &amp; &#39;text&#39;'
    );
  });

  it('encodes reserved characters as decimal or hexadecimal numeric entities', () => {
    expect(encodeHtmlEntities('<&', ENTITY_MODES.DECIMAL)).toBe('&#60;&#38;');
    expect(encodeHtmlEntities('<&', ENTITY_MODES.HEX)).toBe('&#x3c;&#x26;');
  });

  it('encodes all Unicode code points without splitting emoji surrogate pairs', () => {
    expect(encodeHtmlEntities('A한🚀', ENTITY_MODES.DECIMAL, ENTITY_SCOPES.ALL)).toBe(
      '&#65;&#54620;&#128640;'
    );
  });

  it('uses named reserved entities and numeric fallbacks in named all-character mode', () => {
    expect(encodeHtmlEntities('<🚀', ENTITY_MODES.NAMED, ENTITY_SCOPES.ALL)).toBe(
      '&lt;&#128640;'
    );
  });

  it('throws for invalid input, mode, or scope', () => {
    expect(() => encodeHtmlEntities(123)).toThrow(TypeError);
    expect(() => encodeHtmlEntities('text', 'binary')).toThrow(TypeError);
    expect(() => encodeHtmlEntities('text', ENTITY_MODES.NAMED, 'ascii')).toThrow(TypeError);
  });
});

describe('decodeHtmlEntities', () => {
  it('decodes named, decimal, and hexadecimal entities', () => {
    expect(decodeHtmlEntities('&lt;&gt;&amp;&quot;&#39; &#60; &#x1F680;')).toBe('<>&"\' < 🚀');
  });

  it('decodes HTML apos and accepts case-insensitive entity names and hex digits', () => {
    expect(decodeHtmlEntities('&APOS; &#X3C;')).toBe("' <");
  });

  it('preserves unknown and invalid entities rather than changing input', () => {
    expect(decodeHtmlEntities('&unknown; &#x110000; &#-1;')).toBe('&unknown; &#x110000; &#-1;');
  });

  it('throws for non-string input', () => {
    expect(() => decodeHtmlEntities(null)).toThrow(TypeError);
  });
});
