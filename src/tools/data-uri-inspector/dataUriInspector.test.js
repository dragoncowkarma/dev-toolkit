import { describe, expect, it } from 'vitest';
import {
  buildCanonicalDataUri,
  buildPreview,
  inspectDataUri,
  parseDataUri,
} from './dataUriInspector.utils.js';

describe('parseDataUri — default metadata', () => {
  it('applies text/plain;charset=US-ASCII when the media type is entirely omitted', () => {
    const result = parseDataUri('data:,Hello%2C%20World!');
    expect(result.mediaType).toBe('text/plain');
    expect(result.params).toEqual([{ name: 'charset', value: 'US-ASCII' }]);
    expect(result.isBase64).toBe(false);
  });

  it('applies the default when only the ";base64" marker is present', () => {
    const result = parseDataUri('data:;base64,SGVsbG8=');
    expect(result.mediaType).toBe('text/plain');
    expect(result.params).toEqual([{ name: 'charset', value: 'US-ASCII' }]);
    expect(result.isBase64).toBe(true);
  });
});

describe('parseDataUri — ordered parameters', () => {
  it('preserves declared parameter order for a parameterized textual URL', () => {
    const result = parseDataUri('data:text/plain;charset=utf-8;foo=bar,hi');
    expect(result.mediaType).toBe('text/plain');
    expect(result.params).toEqual([
      { name: 'charset', value: 'utf-8' },
      { name: 'foo', value: 'bar' },
    ]);
  });

  it('does not inject a default charset when parameters are explicitly declared', () => {
    const result = parseDataUri('data:text/plain;foo=bar,hi');
    expect(result.params).toEqual([{ name: 'foo', value: 'bar' }]);
  });
});

describe('parseDataUri — percent-encoded decoding', () => {
  it('decodes a valid percent-encoded payload byte-exactly', () => {
    const result = parseDataUri('data:text/plain,Hello%2C%20World%21');
    expect(new TextDecoder().decode(result.bytes)).toBe('Hello, World!');
    expect(result.decodedByteLength).toBe(13);
    expect(result.encodedLength).toBe('Hello%2C%20World%21'.length);
  });

  it('throws for an invalid percent escape', () => {
    expect(() => parseDataUri('data:text/plain,Hello%2G')).toThrow(/Invalid percent-encoding/);
  });

  it('throws for a percent sign truncated at the end of the payload', () => {
    expect(() => parseDataUri('data:text/plain,abc%')).toThrow(/Invalid percent-encoding/);
  });
});

describe('parseDataUri — base64 decoding', () => {
  it('decodes a valid base64 binary payload byte-exactly', () => {
    // 1x1 transparent PNG-like byte sequence, arbitrary binary content.
    const bytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const base64 = btoa(String.fromCharCode(...bytes));
    const result = parseDataUri(`data:image/png;base64,${base64}`);
    expect(result.isBase64).toBe(true);
    expect(result.mediaType).toBe('image/png');
    expect(Array.from(result.bytes)).toEqual(Array.from(bytes));
    expect(result.decodedByteLength).toBe(bytes.length);
  });

  it('throws for invalid base64 characters', () => {
    expect(() => parseDataUri('data:text/plain;base64,not-valid-base64!')).toThrow(
      /Invalid base64/
    );
  });

  it('throws for base64 payload with an invalid length', () => {
    expect(() => parseDataUri('data:text/plain;base64,abc')).toThrow(/Invalid base64/);
  });
});

describe('parseDataUri — malformed input', () => {
  it('throws when the "," delimiter is missing', () => {
    expect(() => parseDataUri('data:text/plain;base64')).toThrow(/Missing/);
  });

  it('throws when the value does not start with "data:"', () => {
    expect(() => parseDataUri('http://example.com')).toThrow(/must start with/);
  });

  it('throws for a malformed media type token', () => {
    expect(() => parseDataUri('data:text/,hi')).toThrow(/Malformed media type or parameter/);
  });

  it('throws for a malformed parameter missing "="', () => {
    expect(() => parseDataUri('data:text/plain;charset,hi')).toThrow(
      /Malformed media type or parameter/
    );
  });

  it('throws for a misplaced ";base64" marker not at the end', () => {
    expect(() => parseDataUri('data:text/plain;base64;charset=utf-8,aGk=')).toThrow(
      /must be the last segment/
    );
  });

  it('throws for a duplicate ";base64" marker', () => {
    expect(() => parseDataUri('data:text/plain;base64;base64,aGk=')).toThrow(/Duplicate/);
  });

  it('throws for a dangling trailing semicolon', () => {
    expect(() => parseDataUri('data:text/plain;,hi')).toThrow(
      /Malformed media type or parameter/
    );
  });

  it('throws for non-string input', () => {
    expect(() => parseDataUri(42)).toThrow(TypeError);
  });

  it('throws for empty input', () => {
    expect(() => parseDataUri('   ')).toThrow(/Enter a data URL/);
  });
});

describe('buildCanonicalDataUri — round-trip', () => {
  it('round-trips a percent-encoded URL without changing decoded bytes or semantics', () => {
    const original = parseDataUri('data:text/plain;charset=utf-8,Hello%2C%20World%21');
    const canonical = buildCanonicalDataUri(original);
    const reparsed = parseDataUri(canonical);
    expect(reparsed.mediaType).toBe(original.mediaType);
    expect(reparsed.params).toEqual(original.params);
    expect(reparsed.isBase64).toBe(original.isBase64);
    expect(Array.from(reparsed.bytes)).toEqual(Array.from(original.bytes));
  });

  it('round-trips a base64 URL without changing decoded bytes or semantics', () => {
    const bytes = Uint8Array.from([0, 1, 2, 253, 254, 255, 65, 66, 67]);
    const base64 = btoa(String.fromCharCode(...bytes));
    const original = parseDataUri(`data:application/octet-stream;base64,${base64}`);
    const canonical = buildCanonicalDataUri(original);
    const reparsed = parseDataUri(canonical);
    expect(reparsed.mediaType).toBe(original.mediaType);
    expect(reparsed.isBase64).toBe(true);
    expect(Array.from(reparsed.bytes)).toEqual(Array.from(bytes));
  });

  it('preserves declared parameter order in the canonical URI', () => {
    const parsed = parseDataUri('data:text/plain;b=2;a=1,hi');
    const canonical = buildCanonicalDataUri(parsed);
    expect(canonical).toBe('data:text/plain;b=2;a=1,hi');
  });
});

describe('buildPreview', () => {
  it('produces an escaped text preview for valid UTF-8 textual data', () => {
    const bytes = new TextEncoder().encode('line1\nline2');
    const preview = buildPreview(bytes);
    expect(preview.kind).toBe('text');
    expect(preview.value).toBe('line1\\nline2');
    expect(preview.truncated).toBe(false);
  });

  it('produces a hex preview for invalid UTF-8 binary data', () => {
    const bytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0xff, 0xfe]);
    const preview = buildPreview(bytes);
    expect(preview.kind).toBe('hex');
    expect(preview.value).toBe('89 50 4e 47 ff fe');
  });
});

describe('inspectDataUri', () => {
  it('returns a full report including a canonical URI and preview', () => {
    const result = inspectDataUri('data:,Hello%20World');
    expect(result.mediaType).toBe('text/plain');
    expect(result.canonicalUri).toContain('data:text/plain;charset=US-ASCII,');
    expect(result.preview.kind).toBe('text');
    expect(result.preview.value).toBe('Hello World');
  });
});
