import { describe, expect, it } from 'vitest';
import { extractJsonLdContent, inspectJsonLd } from './jsonLd.utils.js';

describe('extractJsonLdContent', () => {
  it('returns plain JSON-LD unchanged except for surrounding whitespace', () => {
    expect(extractJsonLdContent('  {"@type":"Thing"}  ')).toEqual({
      content: '{"@type":"Thing"}',
      strippedScriptTags: false,
    });
  });

  it('extracts JSON-LD from application/ld+json script tags', () => {
    const input = '<script type="application/ld+json">{"@type":"Article"}</script>';
    expect(extractJsonLdContent(input)).toEqual({
      content: '{"@type":"Article"}',
      strippedScriptTags: true,
    });
  });

  it('combines multiple JSON-LD scripts into an array document', () => {
    const input = '<script type="application/ld+json">{"@type":"Article"}</script>\n' +
      '<script type="application/ld+json">{"@type":"Person"}</script>';
    expect(extractJsonLdContent(input)).toEqual({
      content: '[{"@type":"Article"},{"@type":"Person"}]',
      strippedScriptTags: true,
    });
  });

  it('throws for non-string input', () => {
    expect(() => extractJsonLdContent(null)).toThrow(TypeError);
  });
});

describe('inspectJsonLd', () => {
  it('extracts nested entities and detects Schema.org', () => {
    const result = inspectJsonLd(JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Article',
      '@id': 'https://example.com/article',
      author: { '@type': 'Person', name: 'Ada' },
    }));

    expect(result.error).toBe('');
    expect(result.vocabulary).toBe('Schema.org');
    expect(result.entities).toEqual([
      expect.objectContaining({ path: '$', types: ['Article'], id: 'https://example.com/article' }),
      expect.objectContaining({ path: '$.author', types: ['Person'] }),
    ]);
    expect(result.issues).toEqual([]);
  });

  it('returns a useful syntax error for invalid JSON', () => {
    expect(inspectJsonLd('{"@context":')).toMatchObject({
      document: null,
      error: expect.stringMatching(/^Invalid JSON:/),
    });
  });

  it('rejects JSON primitives as JSON-LD documents', () => {
    expect(inspectJsonLd('"Article"').error).toBe(
      'A JSON-LD document must be an object or an array of objects.'
    );
  });

  it('reports common structural issues', () => {
    const result = inspectJsonLd(JSON.stringify({
      '@context': 42,
      '@type': { name: 'Article' },
      '@id': 123,
    }));

    expect(result.issues.map((issue) => issue.message)).toEqual([
      '@context should be a URL, object, or array of contexts.',
      '@type should be a string or an array of strings.',
      '@id should be a string.',
    ]);
  });

  it('warns when a document has no linked-data metadata', () => {
    const result = inspectJsonLd('{"name":"Untyped data"}');
    expect(result.issues.map((issue) => issue.message)).toContain(
      'No top-level @context was found. JSON-LD usually needs one to define its vocabulary.'
    );
    expect(result.issues.map((issue) => issue.message)).toContain(
      'No JSON-LD entity metadata (@context, @type, or @id) was found.'
    );
  });
});
