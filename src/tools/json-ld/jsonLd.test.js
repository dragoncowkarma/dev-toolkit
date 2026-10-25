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

  it('rejects arrays that contain JSON primitives', () => {
    expect(inspectJsonLd('["Article"]').error).toBe(
      'A JSON-LD document must be an object or an array of objects.'
    );
  });

  it('reports an error for an empty JSON-LD script tag', () => {
    expect(inspectJsonLd('<script type="application/ld+json"> </script>')).toMatchObject({
      document: null,
      error: 'The JSON-LD script tag is empty.',
      strippedScriptTags: true,
    });
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

  it('warns when sibling entities define duplicate @id values', () => {
    const result = inspectJsonLd(JSON.stringify([
      {
        '@context': 'https://schema.org',
        '@type': 'Person',
        '@id': 'https://example.com/#ada',
        name: 'Ada Lovelace',
      },
      {
        '@context': 'https://schema.org',
        '@type': 'Person',
        '@id': 'https://example.com/#ada',
        name: 'Countess of Lovelace',
      },
    ]));

    expect(result.issues).toEqual([
      {
        severity: 'warning',
        path: '$[1]',
        message: 'Duplicate @id "https://example.com/#ada" is already defined at $[0].',
      },
    ]);
  });

  it('warns when nested entities define duplicate @id values', () => {
    const result = inspectJsonLd(JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Article',
      '@id': 'https://example.com/#shared-id',
      author: {
        '@type': 'Person',
        '@id': 'https://example.com/#shared-id',
        name: 'Ada',
      },
    }));

    expect(result.issues).toEqual([
      {
        severity: 'warning',
        path: '$.author',
        message: 'Duplicate @id "https://example.com/#shared-id" is already defined at $.',
      },
    ]);
  });

  it('warns when a nested @id reference does not resolve to any entity', () => {
    const result = inspectJsonLd(JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Article',
      '@id': 'https://example.com/article',
      author: { '@id': 'https://example.com/#missing-author' },
    }));

    expect(result.issues).toEqual([
      {
        severity: 'warning',
        path: '$.author',
        message: 'Unresolved @id reference "https://example.com/#missing-author" does not match ' +
          'any entity in this document.',
      },
    ]);
  });

  it('produces no @id warnings when entity @id values are unique and references resolve', () => {
    const result = inspectJsonLd(JSON.stringify({
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'Article',
          '@id': 'https://example.com/article',
          author: { '@id': 'https://example.com/#ada' },
        },
        {
          '@type': 'Person',
          '@id': 'https://example.com/#ada',
          name: 'Ada Lovelace',
        },
      ],
      mainEntity: { '@id': 'https://example.com/#ada' },
    }));

    expect(result.error).toBe('');
    expect(result.issues).toEqual([]);
  });

  it('flags only unresolved @id references inside mixed reference arrays', () => {
    const result = inspectJsonLd(JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Article',
      '@id': 'https://example.com/article',
      author: [
        { '@id': 'https://example.com/#missing' },
        { '@type': 'Person', '@id': 'https://example.com/#ada', name: 'Ada' },
        { '@id': 'https://example.com/#ada' },
        { '@id': 'https://example.com/#missing' },
      ],
    }));

    expect(result.issues).toEqual([
      {
        severity: 'warning',
        path: '$.author[0]',
        message: 'Unresolved @id reference "https://example.com/#missing" does not match ' +
          'any entity in this document.',
      },
      {
        severity: 'warning',
        path: '$.author[3]',
        message: 'Unresolved @id reference "https://example.com/#missing" does not match ' +
          'any entity in this document.',
      },
    ]);
  });

  it('treats top-level bare @id objects in an array document as entity definitions', () => {
    const result = inspectJsonLd(JSON.stringify([
      { '@context': 'https://schema.org', '@id': 'https://example.com/#node' },
      { '@id': 'https://example.com/#node' },
    ]));

    expect(result.issues).toEqual([
      {
        severity: 'warning',
        path: '$[1]',
        message: 'Duplicate @id "https://example.com/#node" is already defined at $[0].',
      },
    ]);
  });
});
